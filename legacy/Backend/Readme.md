# GearIN Monolithic Backend Application

This is the monolithic backend application handles request coming from frontend for authentication and product changes built using MongoDB, NodeJS and ExpressJS.

## Run the App on the Local Machine

To Run this application on local machine make sure node.js installed and make accounts at [Braintree](https://www.braintreepayments.com/) and [Paypal Developer](https://developer.paypal.com/home).

and make in a file named as `.env` in `./Backend` then copy below env variables and value with yours
```
    PORT = 4000
    DEV_MODE = development
    MONGO_URL = <Mongo_URI>/GearIN
    JWT_SECRET = <Random_Generated_JWT_Token>
    BRAINTREE_MERCHANT_ID = <MERCHANT_ID from https://www.braintreepayments.com/>
    BRAINTREE_PUBLIC_KEY = <PUBLIC_KEY from https://www.braintreepayments.com/>
    BRAINTREE_PRIVATE_KEY = <PRIVATE_KEY from https://www.braintreepayments.com/>
```
 Install the required dependencies
```
    cd ./Backend
    yarn install
```

Start the backend application.
```
    yarn start
```

Use [http://localhost:4000](http://localhost:4000) to test APIs.

If you want to setup backend with our data then you can use [data dump](../Assets/MongoDB_Datadump/) make sure that collection are listed as below

```
GearIN
    - categories
    - orders
    - products
    - users
```

*Note: for username and passwords evict ".com/.domain" from email and that will passwords for example "test@test.com" pass will be "test@test"*

## Folder Structure

```
.
├── Config                    # Config for DB
├── Controllers               # Controllers for Routes
├── Helpers                   # Helpers for Passwords Hashing
├── Middlewares               # Middleware for APIs 
├── Models                    # Models for MongoDB Collections 
├── Routes                    # Routes for APIs
├── Server.js                   
└── Readme.md
```

## List Of APIs

#### Authentication APIs

| Name | Usage |
| --- | --- |
| **/api/v1/auth/login** | *User Login* |
| **/api/v1/auth/register** | *User Registration* |
| **/api/v1/auth/forgot-password** | *Forgot Password* |
| **/api/v1/auth/user-auth** | *Protected User Route for Authentication* |
| **/api/v1/auth/admin-auth** | *Protected Admin Route for Authentication* |
| **/api/v1/auth/profile** | *Update Profile* |
| **/api/v1/auth/orders** | *Fetch Orders* |
| **/api/v1/auth/all-orders** | *Fetch All Orders* |
| **/api/v1/auth/order-status/:orderId** | *Order Status Update* |
| **/api/v1/auth/test** | *Mainly for Testing Library* |

#### Category APIs

| Name | Usage |
| --- | --- |
| **/api/v1/category/create-category** | *Create Category* |
| **/api/v1/category/update-category/:id** | *Update Category* |
| **/api/v1/category/get-category** | *Get All Category* |
| **/api/v1/category/single-category/:slug** | *Single Category* |
| **/api/v1/category/delete-category/:id** | *Delete Category* |

#### Products APIs

| Name | Usage |
| --- | --- |
| **/api/v1/product/get-product** | *Get Products* |
| **/api/v1/product/get-product/:slug** | *Single Product* |
| **/api/v1/product/product-photo/:pid** | *Get Photograph* |
| **/api/v1/product/delete-product/:pid** | *Delete Product* |
| **/api/v1/product/product-filters** | *Filter Product* |
| **/api/v1/product/product-count** | *Product Count* |
| **/api/v1/product/product-list/:page** | *Product Per Page* |
| **/api/v1/product/search/:keyword** | *Search Product* |
| **/api/v1/product/related-product/:pid/:cid** | *Similar Product* |
| **/api/v1/product/product-category/:slug** | *Category Wise Product* |
| **/api/v1/product/braintree/token** | *Payments Routes for Token by Braintree* |
| **/api/v1/product/braintree/payment** | *Payments Routes for Payments by Braintree* |