const Sequelize = require("sequelize");
const express = require("express");
const amqp = require("amqplib");

const amqpUrl = process.env.AMQP_URL || "amqp://localhost:5672";

const app = express();

// определяем объект Sequelize
const sequelize = new Sequelize("effective_mobile_test", "postgres", "123", {
  dialect: "postgres",
  host: "localhost",
  port: "5432",
});

// определяем модель Event
const Event = sequelize.define("event", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  type: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  user_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

app.set("view engine", "hbs");

// синхронизация с бд, после успешной синхронизации запускаем сервер
sequelize
  .sync()
  .then(() => {
    app.listen(5001, function () {
      console.log("Logger Server is waiting for connection...");
    });
  })
  .catch((err) => console.log(err));

async function connect() {
  try {
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();
    await channel.assertQueue("event.shipped");
    channel.consume("event.shipped", (message) => {
      const { userID, type } = JSON.parse(message.content.toString());
      Event.create({ user_id: userID, type: type });
      channel.ack(message);
    });
  } catch (error) {
    console.log(error);
  }
}

connect();

// получение данных
app.get("/", async (req, res) => {
  Event.findAll({ raw: true })
    .then((data) => {
      res.render("index.hbs", {
        events: data,
      });
    })
    .catch((err) => console.log(err));
});

app.get("/filter/:id", function (req, res) {
  const userid = req.params.id;
  console.log(userid);
  Event.findAll({ where: { user_id: userid }, raw: true }).then((data) => {
    res.render("filtered.hbs", {
      events: data,
      userID: userid,
    });
  });
});
