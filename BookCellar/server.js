// Load environment variables FIRST
require('dotenv').config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const app = express();
const mysql2 = require("mysql2");
const bcrypt = require('bcrypt');
const multer = require('multer');
const OpenAI = require('openai'); // NEW: OpenAI import

// NEW: Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'bookImages')) // Changed to bookImages
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

// File filter to only accept images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Important for cart API
// Add error handling middleware for multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("Multer error:", err);
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  } else if (err) {
    console.error("Other error:", err);
    return res.status(500).json({ error: err.message });
  }
  next();
});


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

// ============================================
// NEW: AI SUMMARY GENERATION FUNCTION
// ============================================
async function generateBookSummary(title, author, description = '') {
  try {
    console.log(`🤖 Generating AI summary for: ${title} by ${author}`);
    
    const prompt = description 
      ? `Write a brief, engaging 2-3 sentence summary for a book titled "${title}" by ${author}. Here's some context: ${description}`
      : `Write a brief, engaging 2-3 sentence summary for a book titled "${title}" by ${author}. Make it sound interesting to potential buyers.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: "You are a helpful book reviewer who writes concise, engaging summaries that make people want to read books. Keep summaries to 2-3 sentences."
      }, {
        role: "user",
        content: prompt
      }],
      max_tokens: 150,
      temperature: 0.7
    });

    const summary = completion.choices[0].message.content.trim();
    console.log(`✅ AI Summary generated: ${summary}`);
    return summary;
    
  } catch (error) {
    console.error('❌ OpenAI API Error:', error.message);
    // Return a fallback summary if API fails
    return `"${title}" by ${author} - An engaging read for book lovers.`;
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
// LOGIN ROUTE - UPDATED
app.post("/login", async (req, res) => {
  console.log("=== LOGIN ATTEMPT ===");
  console.log("Request body:", req.body);
  
  const { Username, password } = req.body;
  
  if (!Username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  
  // UPDATED: Include user_type in the SELECT query
  const sql = "SELECT UserID, First_name, Last_name, Username, pword, user_type FROM user WHERE Username = ?";
  
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
    
    // SET SESSION DATA - UPDATED to include user_type
    req.session.UserID = user.UserID;
    req.session.Username = user.Username;
    req.session.fullName = `${user.First_name} ${user.Last_name}`;
    req.session.user_type = user.user_type; // ADD THIS
    
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
          fullName: `${user.First_name} ${user.Last_name}`,
          user_type: user.user_type // ADD THIS
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
// CHECK LOGIN STATUS - UPDATED
app.get("/check_auth", (req, res) => {
  if (req.session.UserID) {
    res.json({ 
      authenticated: true,
      user: {
        UserID: req.session.UserID,
        Username: req.session.Username,
        fullName: req.session.fullName,
        user_type: req.session.user_type // ADD THIS
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
    
    const { Username, First_name, Last_name, DOB, email, password, user_type } = req.body;
    
    if (!Username || !First_name || !Last_name || !DOB || !email || !password || !user_type) {
      console.log("❌ Missing required fields");
      return res.status(400).send("All fields are required");
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // UPDATED SQL - now includes user_type
    const sql = "INSERT INTO user (Username, First_name, Last_name, DOB, Email, pword, user_type) VALUES (?, ?, ?, ?, ?, ?, ?)";
    
    const values = [Username, First_name, Last_name, DOB, email, hashedPassword, user_type];
    
    database.query(sql, values, (err, result) => {
      if (err) {
        console.error("\n❌ DATABASE ERROR:", err);
        
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

// ============================================
// UPDATED: Sell book route WITH AI SUMMARY
// ============================================
app.post("/sell_book", isAuthenticated, upload.single('bookImage'), async (req, res) => {
  console.log("=== SELL BOOK REQUEST ===");
  console.log("Body:", req.body);
  console.log("File:", req.file);
  console.log("Session UserID:", req.session.UserID);
  
  try {
    const { title, author, price, description } = req.body;
    const seller_id = req.session.UserID;
    
    if (!title || !author || !price || !description) {
      return res.status(400).json({ error: "All fields are required" });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: "Image is required" });
    }
    
    const photo = `bookImages/${req.file.filename}`;
    console.log("Photo path:", photo);

    // Generate a unique ISBN-like number
    const fakeISBN = Date.now();

    // NEW: Generate AI summary
    console.log("🤖 Generating AI summary...");
    const aiSummary = await generateBookSummary(title, author, description);
    console.log("✅ AI Summary:", aiSummary);

    // STEP 1: Insert into books_for_sale (tracking table) - NOW WITH AI SUMMARY
    const sqlForSale = `
      INSERT INTO books_for_sale (seller_id, title, author, price, description, photo, ai_summary, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
    `;

    database.query(sqlForSale, [seller_id, title, author, price, description, photo, aiSummary], (err, result) => {
      if (err) {
        console.error("❌ DATABASE ERROR (books_for_sale):", err);
        return res.status(500).json({ error: "Database error: " + err.message });
      }

      console.log("✅ Added to books_for_sale! ID:", result.insertId);

      // STEP 2: Also insert into main book table (so it shows on buy page)
      const sqlBook = `
        INSERT INTO book (ISBN, Name_of_book, Author, Description_of_book, photo, price)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      database.query(sqlBook, [fakeISBN, title, author, description, photo, price], (err2, result2) => {
        if (err2) {
          console.error("❌ DATABASE ERROR (book):", err2);
          return res.status(500).json({ error: "Failed to add to store: " + err2.message });
        }

        console.log("✅ Added to main book table! ISBN:", fakeISBN);
        
        // NEW: Return AI summary in response
        res.json({ 
          success: true, 
          message: "Your book has been listed with an AI-generated summary!",
          photo: photo,
          ISBN: fakeISBN,
          ai_summary: aiSummary // NEW: Send AI summary back to client
        });
      });
    });
  } catch (error) {
    console.error("❌ CATCH ERROR:", error);
    return res.status(500).json({ error: "Server error: " + error.message });
  }
});






// Get seller's own listings - UPDATED TO INCLUDE AI SUMMARY
app.get("/my_listings", isAuthenticated, (req, res) => {
  const seller_id = req.session.UserID;
  
  const sql = "SELECT * FROM books_for_sale WHERE seller_id = ? ORDER BY created_at DESC";
  
  database.query(sql, [seller_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to get listings" });
    }
    res.json(results);
  });
});

// NEW: Optional route to regenerate AI summary for existing books
app.post("/regenerate_summary/:book_id", isAuthenticated, async (req, res) => {
  try {
    const { book_id } = req.params;
    const seller_id = req.session.UserID;
    
    // Get book details
    const getBookQuery = "SELECT title, author, description FROM books_for_sale WHERE book_id = ? AND seller_id = ?";
    
    database.query(getBookQuery, [book_id, seller_id], async (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).json({ error: 'Book not found or not authorized' });
      }
      
      const book = results[0];
      const newSummary = await generateBookSummary(book.title, book.author, book.description);
      
      // Update the summary
      const updateQuery = 'UPDATE books_for_sale SET ai_summary = ? WHERE book_id = ? AND seller_id = ?';
      
      database.query(updateQuery, [newSummary, book_id, seller_id], (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to update summary' });
        }
        
        res.json({ 
          success: true, 
          ai_summary: newSummary 
        });
      });
    });
  } catch (error) {
    console.error('Error regenerating summary:', error);
    res.status(500).json({ error: 'Failed to regenerate summary' });
  }
});

app.listen(4000, () => {
  console.log("server listening on port 4000...");
  console.log("🤖 OpenAI integration active!");
  if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️  WARNING: OPENAI_API_KEY not found in environment variables!");
    console.warn("   Please create a .env file with your OpenAI API key");
  }
});