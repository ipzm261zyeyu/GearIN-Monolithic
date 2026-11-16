<a name="readme-top"></a>

<div align="center">
  <img src="./Assets/Logo.png" alt="Logo" width="80" height="80">
  <h3>GearIN</h3>
  <p>Інтернет-магазин на MERN, перебудований із моноліту в сервісну архітектуру за патерном Strangler Fig</p>
</div>

## Зміст

- [Архітектура](#архітектура)
- [Сервіси та порти](#сервіси-та-порти)
- [Запуск](#запуск)
- [Запуск без Docker](#запуск-без-docker)
- [Перенесення даних](#перенесення-даних)
- [Тести](#тести)
- [Патерни](#патерни)
- [Структура репозиторію](#структура-репозиторію)
- [Ліцензія](#ліцензія)

## Архітектура

Браузер звертається лише до шлюзу. Шлюз перевіряє JWT і роль, передає сервісам заголовки `x-user-id` та `x-user-role` і видаляє такі самі заголовки, надіслані клієнтом. Сервіси спілкуються між собою лише через HTTP/JSON, кожен зі своєю базою.

```mermaid
flowchart LR
    browser["Браузер"] -->|":3000"| frontend["frontend<br/>React + nginx"]
    browser -->|":8080 /api/v1/*"| gateway["gateway<br/>JWT і роль"]

    gateway --> users["users<br/>:4001"]
    gateway --> catalog["catalog<br/>:4002"]
    gateway --> payments["payments<br/>:4003"]
    gateway --> orders["orders<br/>:4004"]

    orders -->|"/internal/products/by-ids<br/>/internal/stock/*"| catalog
    orders -->|"/internal/charge"| payments
    orders -->|"/internal/users/by-ids"| users

    users --> usersDb[("gearin_users")]
    catalog --> catalogDb[("gearin_catalog")]
    orders --> ordersDb[("gearin_orders")]
    payments --> braintree["Braintree<br/>або FakeProvider"]
```

Маршрути `/internal/*` шлюз не пропускає, вони доступні лише всередині мережі Docker.

### Оформлення замовлення

Клієнт надсилає лише `productId`, `quantity` і `nonce`. Ціни сервер бере з каталогу.

1. `orders` отримує назви й ціни з `catalog`.
2. `catalog` резервує залишки: або всі позиції, або жодної.
3. `orders` рахує суму та викликає `payments`.
4. Якщо оплата успішна, зберігається замовлення зі знімком позицій. Якщо ні, резерв повертається.

## Сервіси та порти

| Сервіс | Порт | Опублікований назовні | База | Відповідає за |
|---|---|---|---|---|
| `frontend` | 80 (на хості 3000) | так | — | клієнт React |
| `gateway` | 8080 | так | — | єдина точка входу, JWT, роль, маршрутизація |
| `users` | 4001 | ні | `gearin_users` | реєстрація, вхід, профіль, відновлення пароля |
| `catalog` | 4002 | ні | `gearin_catalog` | категорії, товари, фото, залишки |
| `payments` | 4003 | ні | немає | токен клієнта, списання коштів |
| `orders` | 4004 | ні | `gearin_orders` | оформлення та історія замовлень |

| Шлях на шлюзі | Сервіс |
|---|---|
| `/api/v1/auth/register`, `login`, `forgot-password`, `profile`, `user-auth`, `admin-auth` | `users` |
| `/api/v1/category/*`, `/api/v1/product/*` | `catalog` |
| `/api/v1/product/braintree/token` | `payments` |
| `/api/v1/auth/orders`, `all-orders`, `order-status/:id`, `/api/v1/product/braintree/payment` | `orders` |

## Запуск

Потрібні Docker із Compose і база MongoDB, наприклад кластер MongoDB Atlas.

1. Створіть файл налаштувань і заповніть його:

   ```sh
   cp .env.example .env
   ```

   | Змінна | Значення |
   |---|---|
   | `MONGO_URL` | адреса MongoDB з назвою старої бази в шляху, наприклад `.../gearin`. Сервіси самі перемикаються на власні бази, а стара база є джерелом для перенесення даних |
   | `JWT_SECRET` | секрет для підпису токенів |
   | `PAYMENT_PROVIDER` | `braintree` або `fake` |
   | `BRAINTREE_*` | ключі пісочниці Braintree, потрібні лише для `braintree` |

2. Запустіть усі контейнери:

   ```sh
   docker compose up --build
   ```

3. Перенесіть дані, якщо вони є в старій базі (див. нижче).

4. Відкрийте [http://localhost:3000](http://localhost:3000). API доступне за адресою `http://localhost:8080`.

Адреса шлюзу вбудовується в клієнт під час збірки. Її задає `REACT_APP_API_URL` у `docker-compose.yml`.

З `PAYMENT_PROVIDER=fake` сервіс платежів працює без ключів, але форма оплати Braintree у браузері не прийме фальшивий токен. Цей режим призначений для тестів і перевірки API.

## Запуск без Docker

Усі сервіси й клієнт запускаються однією командою з кореня, кожен окремим процесом Node.js на своєму порту. Налаштування беруться з одного кореневого файлу `.env`.

Потрібні:

- Node.js 18 або новіший, `npm` і `yarn` (`npm install -g yarn`);
- MongoDB: локальний [MongoDB Community Server](https://www.mongodb.com/try/download/community) на `127.0.0.1:27017` або кластер MongoDB Atlas.

Команди для Windows PowerShell, з кореня репозиторію:

1. Встановіть залежності кореня, усіх сервісів і клієнта:

   ```powershell
   npm run install:all
   ```

2. Створіть файл налаштувань:

   ```powershell
   Copy-Item .env.example .env
   ```

   Значення за замовчуванням уже підходять для локальної MongoDB. Для Atlas замініть `MONGO_URL`, залишивши в шляху назву старої бази, наприклад `.../gearin`. Задайте власний `JWT_SECRET`. Змінні, яких немає в `.env`, беруться з `.env.example`.

3. Якщо стара база порожня, заповніть її демонстраційними даними: 3 категорії, 6 товарів і адміністратор `admin@gearin.test` з паролем `admin123`:

   ```powershell
   $env:MONGO_URL = "mongodb://127.0.0.1:27017/gearin"
   node legacy/Backend/seed.js
   Remove-Item Env:MONGO_URL
   ```

4. Перенесіть дані зі старої бази в бази сервісів:

   ```powershell
   npm run migrate
   ```

5. Запустіть усе:

   ```powershell
   npm run dev
   ```

   Коли в журналі з'являться рядки `listening` від сервісів і `Compiled successfully!` від `frontend`, відкрийте [http://localhost:3000](http://localhost:3000). Зупинити все можна клавішами `Ctrl+C`.

6. Перевірте шлюз:

   ```powershell
   Invoke-RestMethod http://localhost:8080/api/v1/product/get-product
   ```

| Процес | Порт | Змінна порту | База |
|---|---|---|---|
| `frontend` | 3000 | `FRONTEND_PORT` | — |
| `gateway` | 8080 | `GATEWAY_PORT` | — |
| `users` | 4001 | `USERS_PORT` | `USERS_DB_NAME`, `gearin_users` |
| `catalog` | 4002 | `CATALOG_PORT` | `CATALOG_DB_NAME`, `gearin_catalog` |
| `payments` | 4003 | `PAYMENTS_PORT` | — |
| `orders` | 4004 | `ORDERS_PORT` | `ORDERS_DB_NAME`, `gearin_orders` |

Сервіси знаходять один одного за адресами `USERS_URL`, `CATALOG_URL`, `PAYMENTS_URL` і `ORDERS_URL` (`http://localhost:<порт>`), а клієнт звертається до шлюзу за `REACT_APP_API_URL`. Якщо змінюєте порт, змініть і відповідну адресу.

### Оплата без ключів Braintree

За замовчуванням у `.env.example` стоїть `PAYMENT_PROVIDER=fake`, тому ключі Braintree не потрібні. Каталог, кошик, вхід, реєстрація й замовлення через API працюють, а `/api/v1/product/braintree/token` повертає `fake-client-token`.

Віджет оплати Braintree у браузері такий токен не прийме, тому оплатити замовлення через інтерфейс у цьому режимі не вийде. Щоб перевірити справжню оплату, задайте `PAYMENT_PROVIDER=braintree` і заповніть `BRAINTREE_MERCHANT_ID`, `BRAINTREE_PUBLIC_KEY` і `BRAINTREE_PRIVATE_KEY` ключами пісочниці Braintree.

## Перенесення даних

Скрипти копіюють дані зі старої бази в бази сервісів. Запускати їх можна повторно: наявні записи вони не перезаписують.

Без Docker:

```sh
npm run migrate
```

У Docker:

```sh
docker compose run --rm users node scripts/migrate-users.js
docker compose run --rm catalog node scripts/migrate-catalog.js
docker compose run --rm orders node scripts/migrate-orders.js
```

Під час перенесення відповіді на секретні питання хешуються, а старі замовлення отримують знімок позицій із поточними назвами й цінами товарів.

## Тести

Перед першим запуском встановіть залежності, потім запустіть усі набори з кореня:

```sh
npm run install:all
npm test
```

| Набір | Що перевіряє |
|---|---|
| `services/*`, `npm test` | кожен сервіс окремо: патерни, маршрути, міграції |
| `legacy/Backend`, `npm test` | характеризаційні тести поведінки старого моноліту |
| `legacy/Backend`, `npm run test:gateway` | ті самі сценарії та повне оформлення замовлення через шлюз і всі сервіси |
| `Frontend`, `npm test` | формування позицій замовлення з кошика |

Базу MongoDB для тестів піднімає `mongodb-memory-server`, Braintree замокано.

## Патерни

| Патерн | Де |
|---|---|
| Singleton | `Config` у кожному сервісі, `Database` у сервісах із базою, `Logger` у шлюзі |
| Factory Method | `PaymentProcessor.createProvider()` перевизначають `BraintreePaymentProcessor` і `FakePaymentProcessor`, повертаючи `BraintreeProvider` або `FakeProvider` |
| Abstract Factory | `StorageFactory`: `MongoStorageFactory` та `InMemoryStorageFactory` |
| Builder | `ProductQueryBuilder`, `OrderBuilder` |
| Prototype | `Product.clone(overrides)` |

## Структура репозиторію

```text
.
├── Frontend/            клієнт React
├── services/
│   ├── gateway/         шлюз API
│   ├── users/           користувачі
│   ├── catalog/         каталог
│   ├── payments/        платежі
│   └── orders/          замовлення
├── legacy/Backend/      старий моноліт і характеризаційні тести, у запуску не бере участі
├── Assets/              логотип і дамп даних MongoDB
├── scripts/             npm run dev і npm run migrate для запуску без Docker
├── .env.example         спільні налаштування для Docker і локального запуску
└── docker-compose.yml
```

## Ліцензія

Поширюється за ліцензією MIT. Див. файл `LICENSE`.

<p align="right">(<a href="#readme-top">на початок</a>)</p>
