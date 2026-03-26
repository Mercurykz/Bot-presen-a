const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log("Bot online: " + client.user.tag);
});

client.login(process.env.DISCORD_TOKEN);
console.log("DEBUG ENV:", process.env.DISCORD_CLIENT_ID);
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const sqlite3 = require("sqlite3").verbose();
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// DB
const db = new sqlite3.Database("./db.sqlite");

db.serialize(()=>{
  db.run(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY,
      discord_id TEXT UNIQUE,
      username TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chamadas(
      id TEXT PRIMARY KEY,
      ativa INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS presencas(
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      chamada_id TEXT
    )
  `);
});

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
 db.run("INSERT INTO chamadas(id, ativa) VALUES (?,1)", [id]);

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

 db.get("SELECT * FROM users WHERE discord_id=?", [discordId], (e,user)=>{
   if(!user){
     db.run(
       "INSERT INTO users(discord_id, username) VALUES (?,?)",
       [discordId, req.user.username]
     );
   }

   db.get("SELECT id FROM users WHERE discord_id=?", [discordId], (e,u)=>{
     db.get(
       "SELECT * FROM presencas WHERE user_id=? AND chamada_id=?",
       [u.id, chamada],
       (e,p)=>{

         if(p) return res.send("Já registrado");

         db.run(
           "INSERT INTO presencas(user_id,chamada_id) VALUES (?,?)",
           [u.id, chamada]
         );

         io.emit("nova_presenca", {user:req.user.username});

         res.send("Presença OK");
       }
     );
   });
 });
});

io.on("connection", ()=>{});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Rodando na porta " + PORT));
