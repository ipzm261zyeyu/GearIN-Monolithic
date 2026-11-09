import React, { useState } from "react";
import Layout from "./../../Components/Layout/Layout";
import api from "../../api";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import "../../Styles/AuthStyles.css";
const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [answer, setAnswer] = useState("");
  const navigate = useNavigate();

  // form function
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/api/v1/auth/register", {
        name,
        email,
        password,
        phone,
        address,
        answer,
      });
      if (res && res.data.success) {
        toast.success(res.data && res.data.message);
        navigate("/login");
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      console.log(error);
      toast.error("Something went wrong");
    }
  };

  return (
    <Layout title="Register | GearIN">
      <div className="form-container" style={{ minHeight: "90vh" }}>
        <form onSubmit={handleSubmit}>
          <h4 className="title">REGISTRATION FORM</h4>
          <div className="mb-3">
            <label for="full-name">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-control"
              id="exampleInputEmail1"
              name="full-name"
              placeholder="Enter your name"
              required
              autoFocus
            />
          </div>
          <div className="mb-3">
            <label for="email">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-control"
              id="exampleInputEmail1"
              name="email"
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="mb-3">
            <label for="password">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-control"
              id="exampleInputPassword1"
              name="password"
              placeholder="Enter your password"
              required
            />
          </div>
          <div className="mb-3">
            <label for="phone">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="form-control"
              id="exampleInputEmail1"
              name="phone"
              placeholder="Enter your phone"
              required
            />
          </div>
          <div className="mb-3">
            <label for="address">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="form-control"
              id="exampleInputEmail1"
              name="address"
              placeholder="Enter your address"
              required
            />
          </div>
          <div className="mb-3">
            <label for="security-ans">Security Answer</label>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="form-control"
              id="exampleInputEmail1"
              name="security-ans"
              placeholder="Security answer"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            SIGN UP
          </button>
        </form>
      </div>
    </Layout>
  );
};

export default Register;
