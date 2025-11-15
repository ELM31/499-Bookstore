const express = require("express");
const path = require("path");
const app = express();
const mysql2 = require("mysql2");

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
  console.log("Database connected! ");
});

//middleware below
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  const html_login = path.join(__dirname, "signup.html");
  res.sendFile(html_login);
});

// Change the route name from /book_page to /buy_page_data
app.get("/buy_page_data", (req, res) => {
  const showAllBooks = "SELECT * FROM book"
  database.query(showAllBooks, (err, data) => {
    if(err) return res.json(err)
    return res.json(data)
  })
})

// Keep this route to serve the HTML page
app.get("/buy_page", (req, res) => {
  const html_buy = path.join(__dirname, "buy_Page.html");
  res.sendFile(html_buy);
});

app.post("/handle_form", (req, res) => {
  try {
    const { name, email, Username, password } = req.body;
    const sql_command =
      "INSERT INTO userdetails(fullName,email,Username,pword) Values (?,?,?,?)";
    database.query(
      sql_command,
      [name, email, Username, password],
      (err, result) => {
        if (err) {
          console.err(err);
          return res.send("registration unsuccessful");
        }
        console.log(result);
        res.send("success ");
      }
    );
  } catch (err) {
    console.error(err);
    console.send("registration Unsuccessful");
  }
});

//Sell book route 
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
  console.log("server listening...");
});

