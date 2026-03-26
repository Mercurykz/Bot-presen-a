require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const Database = require("better-sqlite3");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// DB
const db = new Database("./db.sqlite");

// Criar tabelas
db.prepare(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  discord_id TEXT UNIQUE,
  username TEXT
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS chamadas(
  id TEXT PRIMARY KEY,
  ativa INTEGER
)`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS presencas(
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  chamada_id TEXT
)`).run();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((u, done)=>done(null,u));
passport.deserializeUser((u, done)=>done(null,u));

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK,
  scope: ["identify"]
}, (a,b,profile,done)=>done(null, profile)));

// Rotas
app.get("/auth/discord", passport.authenticate("discord"));

app.get("/auth/discord/callback",
 passport.authenticate("discord", { failureRedirect:"/" }),
 (req,res)=> res.redirect("/dashboard")
);

app.get("/dashboard", (req,res)=>{
 if(!req.user) return res.redirect("/auth/discord");
 res.send("Dashboard ativo");
});

app.post("/api/chamada", (req,res)=>{
 const id = uuidv4();
 db.prepare("INSERT INTO chamadas(id, ativa) VALUES (?,1)").run(id);

 res.json({id, link:`https://SEU-DOMINIO/checkin/${id}`});
});

app.get("/checkin/:id", (req,res)=>{
 req.session.chamada = req.params.id;
 res.send('<a href="/auth/discord">Login com Discord</a>');
});

app.get("/registrar", (req,res)=>{
 if(!req.user) return res.redirect("/");

 const discordId = req.user.id;
 const chamada = req.session.chamada;

 let user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(discordId);

 if(!user){
   db.prepare("INSERT INTO users(discord_id, username) VALUES (?,?)")
     .run(discordId, req.user.username);

   user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(discordId);
 }

 const presenca = db.prepare(
   "SELECT * FROM presencas WHERE user_id=? AND chamada_id=?"
 ).get(user.id, chamada);

 if(presenca) return res.send("Já registrado");

 db.prepare(
   "INSERT INTO presencas(user_id,chamada_id) VALUES (?,?)"
 ).run(user.id, chamada);

 io.emit("nova_presenca", {user:req.user.username});

 res.send("Presença OK");
});

io.on("connection", ()=>{});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Rodando na porta " + PORT));
