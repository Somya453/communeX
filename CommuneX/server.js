require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ ERROR: MONGO_URI is missing in .env file!");
    process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// User Schema
const UserSchema = new mongoose.Schema({
    email: String,
    password: String,
});
const User = mongoose.model("User", UserSchema);

// Middleware to Verify JWT Token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access Denied. No token provided." });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userEmail = decoded.email;
        next();
    } catch (err) {
        res.status(400).json({ error: "Invalid Token" });
    }
};

// Register Route
app.post("/api/register", async (req, res) => {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "User already exists!" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    res.json({ message: "User registered successfully!" });
});

// Login Route
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, email: user.email });
});

// Issue Schema
const IssueSchema = new mongoose.Schema({
    title: String,
    description: String,
    email: String,
    status: { type: String, default: "Pending" },
    createdAt: { type: Date, default: Date.now }
});
const Issue = mongoose.model("Issue", IssueSchema);

// Report an Issue (with WebSocket Update)
app.post("/api/issues", verifyToken, async (req, res) => {
    const { title, description } = req.body;
    if (!title || !description) return res.status(400).json({ error: "All fields are required!" });

    const newIssue = new Issue({ title, description, email: req.userEmail });
    await newIssue.save();

    io.emit("new_issue", newIssue);
    res.json({ message: "Issue reported successfully!" });
});

// Get Only Logged-in User's Issues
app.get("/api/issues", verifyToken, async (req, res) => {
    try {
        const issues = await Issue.find({ email: req.userEmail }).sort({ createdAt: -1 });
        res.json(issues);
    } catch (error) {
        console.error("Error fetching issues:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Event Schema
const EventSchema = new mongoose.Schema({
    title: String,
    date: Date,
    description: String,
    email: String,
    createdAt: { type: Date, default: Date.now }
});
const Event = mongoose.model("Event", EventSchema);

// Create an Event (with WebSocket Update)
app.post("/api/events", verifyToken, async (req, res) => {
    const { title, date, description } = req.body;
    if (!title || !date || !description) return res.status(400).json({ error: "All fields are required!" });

    const newEvent = new Event({ title, date, description, email: req.userEmail });
    await newEvent.save();

    io.emit("new_event", newEvent);
    res.json({ message: "Event posted successfully!" });
});

// Get All Events
app.get("/api/events", async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 });
        res.json(events);
    } catch (error) {
        console.error("Error fetching events:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Service Schema
const ServiceSchema = new mongoose.Schema({
    title: String,
    description: String,
    type: String,
    email: String,
    createdAt: { type: Date, default: Date.now }
});
const Service = mongoose.model("Service", ServiceSchema);

// Create a Service (with WebSocket Update)
app.post("/api/services", verifyToken, async (req, res) => {
    const { title, description, type } = req.body;
    if (!title || !description || !type) return res.status(400).json({ error: "All fields are required!" });

    const newService = new Service({ title, description, type, email: req.userEmail });
    await newService.save();

    io.emit("new_service", newService);
    res.json({ message: "Service posted successfully!" });
});

// Get All Services
app.get("/api/services", async (req, res) => {
    try {
        const services = await Service.find().sort({ createdAt: -1 });
        res.json(services);
    } catch (error) {
        console.error("Error fetching services:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// WebSocket connection setup
io.on("connection", (socket) => {
    console.log("⚡ A user connected:", socket.id);
    socket.on("disconnect", () => {
        console.log("❌ A user disconnected:", socket.id);
    });
});

// Start the WebSocket server
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
