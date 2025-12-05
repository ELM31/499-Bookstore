const express = require("express");
const path = require("path");
const session = require("express-session");
const app = express();
const mysql2 = require("mysql2");
const bcrypt = require('bcrypt');

const database = mysql2.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "Machu123-",
  database: "bookstoredb",
});

database.connect((error) => {
  if (error) {
    return console.error(error);
  }
  console.log("Database connected!");
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Important for cart API

// Session setup for user login
app.use(session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false
  }
}));
app.use(express.static(__dirname));

// Middleware to check if user is logged in
function isAuthenticated(req, res, next) {
  if (req.session.UserID) {
    next();
  } else {
    res.status(401).json({ error: 'Please log in first' });
  }
}

app.get("/", (req, res) => {
  const html_login = path.join(__dirname, "signup.html");
  res.sendFile(html_login);
});

// Get all books
app.get("/buy_page_data", (req, res) => {
  const showAllBooks = "SELECT * FROM book";
  database.query(showAllBooks, (err, data) => {
    if (err) return res.json(err);
    return res.json(data);
  });
});

app.get("/buy_page", (req, res) => {
  const html_buy = path.join(__dirname, "buy_Page.html");
  res.sendFile(html_buy);
});





// LOGIN ROUTE
app.post("/login", async (req, res) => {
  console.log("=== LOGIN ATTEMPT ===");
  console.log("Request body:", req.body);
  
  const { Username, password } = req.body;
  
  if (!Username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  
  const sql = "SELECT UserID, First_name, Last_name, Username, pword FROM user WHERE Username = ?";
  
  database.query(sql, [Username], async (err, results) => {
    if (err) {
      console.error("❌ Database error:", err);
      return res.status(500).json({ error: "Login failed" });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const user = results[0];
    
    // Compare hashed password
    const match = await bcrypt.compare(password, user.pword);
    
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // SET SESSION DATA
    req.session.UserID = user.UserID;
    req.session.Username = user.Username;
    req.session.fullName = `${user.First_name} ${user.Last_name}`;
    
    // SAVE SESSION EXPLICITLY
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ error: "Login failed" });
      }
      
      console.log("✅ Login successful! Session saved:", req.session);
      
      res.json({ 
        success: true, 
        user: {
          UserID: user.UserID,
          Username: user.Username,
          fullName: `${user.First_name} ${user.Last_name}`
        }
      });
    });
  });
});






// LOGOUT ROUTE
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});





// CHECK LOGIN STATUS
app.get("/check_auth", (req, res) => {
  if (req.session.UserID) {
    res.json({ 
      authenticated: true,
      user: {
        UserID: req.session.UserID,
        Username: req.session.Username,
        fullName: req.session.fullName
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});






// ADD TO CART
app.post("/add_to_cart", isAuthenticated, (req, res) => {
  const { ISBN } = req.body;
  const UserID = req.session.UserID;
  
  const sql = "INSERT INTO cart (UserID, ISBN, quantity) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE quantity = quantity + 1";
  
  database.query(sql, [UserID, ISBN], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to add to cart" });
    }
    res.json({ success: true, message: "Added to cart!" });
  });
});






// GET CART ITEMS
app.get("/get_cart", isAuthenticated, (req, res) => {
  const UserID = req.session.UserID;
  
  const sql = `
    SELECT c.cart_id, c.ISBN, c.quantity, b.Name_of_book, b.Author, b.photo, b.Description_of_book
    FROM cart c
    JOIN book b ON c.ISBN = b.ISBN
    WHERE c.UserID = ?
  `;
  
  database.query(sql, [UserID], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to get cart" });
    }
    res.json(results);
  });
});







// UPDATE CART QUANTITY
app.put("/update_cart_quantity", isAuthenticated, (req, res) => {
  const { cart_id, quantity } = req.body;
  const UserID = req.session.UserID;
  
  if (quantity < 1) {
    return res.status(400).json({ error: "Quantity must be at least 1" });
  }
  
  const sql = "UPDATE cart SET quantity = ? WHERE cart_id = ? AND UserID = ?";
  
  database.query(sql, [quantity, cart_id, UserID], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to update quantity" });
    }
    res.json({ success: true, message: "Quantity updated" });
  });
});





// REMOVE FROM CART
app.delete("/remove_from_cart/:cart_id", isAuthenticated, (req, res) => {
  const { cart_id } = req.params;
  const UserID = req.session.UserID;
  
  const sql = "DELETE FROM cart WHERE cart_id = ? AND UserID = ?";
  
  database.query(sql, [cart_id, UserID], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to remove from cart" });
    }
    res.json({ success: true, message: "Removed from cart" });
  });
});







// Get cart items (from database)
app.get("/get_cart", isAuthenticated, (req, res) => {
    const UserID = req.session.UserID;
    
    const sql = `
        SELECT cart.cart_id, cart.ISBN, cart.quantity, 
               book.Name_of_book, book.Author, book.photo
        FROM cart
        JOIN book ON cart.ISBN = book.ISBN
        WHERE cart.UserID = ?
    `;
    
    database.query(sql, [UserID], (err, results) => {
        if (err) {
            console.error("Get cart error:", err);
            return res.status(500).json({ error: "Failed to get cart" });
        }
        res.json(results);
    });
});

// Serve checkout page
app.get("/checkout", (req, res) => {
    const html_checkout = path.join(__dirname, "checkout.html");
    res.sendFile(html_checkout);
});






// User registration (your existing route)
app.post("/handle_form", async (req, res) => {
  try {
    console.log("=== SIGNUP ATTEMPT ===");
    console.log("Request body:", req.body);
    
    const { Username, First_name, Last_name, DOB, email, password } = req.body;
    
    console.log("\n📝 Extracted Values:");
    console.log("Username:", Username, "| Length:", Username?.length);
    console.log("First_name:", First_name, "| Length:", First_name?.length);
    console.log("Last_name:", Last_name, "| Length:", Last_name?.length);
    console.log("DOB:", DOB);
    console.log("email:", email, "| Length:", email?.length);
    console.log("password:", password, "| Length:", password?.length);
    
    if (!Username || !First_name || !Last_name || !DOB || !email || !password) {
      console.log("❌ Missing required fields");
      return res.status(400).send("All fields are required");
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("✅ Hashed password length:", hashedPassword.length);
    
    const sql = "INSERT INTO user (Username, First_name, Last_name, DOB, Email, pword) VALUES (?, ?, ?, ?, ?, ?)";
    
    const values = [Username, First_name, Last_name, DOB, email, hashedPassword];
    console.log("\n💾 Values to insert:", values);
    console.log("Value lengths:", values.map(v => v?.length || 'N/A'));
    
    database.query(sql, values, (err, result) => {
      if (err) {
        console.error("\n❌ DATABASE ERROR:");
        console.error("Error code:", err.code);
        console.error("Error message:", err.message);
        console.error("SQL state:", err.sqlState);
        console.error("Full error:", err);
        
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).send("Username or email already exists");
        }
        
        return res.status(500).send("Registration failed: " + err.message);
      }
      
      console.log("✅ Registration successful! User ID:", result.insertId);
      res.redirect('/login.html');
    });
    
  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).send("Server error: " + err.message);
  }
});


// Sell book route 
app.post("/sell_book", (req, res) => {
  const { title, author, price, description } = req.body;

  const sql = `
    INSERT INTO books_for_sale (title, author, price, description)
    VALUES (?, ?, ?, ?)
  `;

  database.query(sql, [title, author, price, description], (err, result) => {
    if (err) {
      console.error(err);
      return res.send("Book listing failed.");
    }

    console.log(result);
    res.send("Your book has been submitted for review!");
  });
});

app.listen(4000, () => {
  console.log("server listening on port 4000...");
});