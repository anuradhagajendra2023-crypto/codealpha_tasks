# CodeAlpha E-Commerce Store

A full-stack e-commerce website developed as part of the CodeAlpha internship project.

## Features

- User registration and login
- Secure password hashing using bcrypt
- User logout and session management
- View available products
- View product details
- Add products to cart
- Update cart quantities
- Remove products from cart
- Stock management
- Checkout system
- Order confirmation
- Persistent order storage
- User-specific order history
- SQLite database for users, products, and orders
- Responsive and simple user interface

## Technologies Used

- Node.js
- Express.js
- EJS
- SQLite
- better-sqlite3
- bcryptjs
- express-session
- HTML
- CSS
- JavaScript

## Database

The project uses SQLite to permanently store:

- Users
- Products
- Orders
- Order items

Passwords are securely hashed using `bcryptjs`.

The local SQLite database file (`ecommerce.db`) is excluded from GitHub using `.gitignore`.

## Project Structure

```text
CodeAlpha_EcommerceStore/
├── data/
│   └── products.json
├── public/
│   └── style.css
├── views/
│   ├── products.ejs
│   ├── product-details.ejs
│   ├── cart.ejs
│   ├── checkout.ejs
│   ├── order-confirmation.ejs
│   ├── orders.ejs
│   ├── login.ejs
│   └── register.ejs
├── .gitignore
├── database.js
├── package.json
├── package-lock.json
├── README.md
└── server.js
