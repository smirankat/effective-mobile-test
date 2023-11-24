const Sequelize = require("sequelize");
const express = require("express");
const amqp = require("amqplib");
const hbs = require("hbs");

const amqpUrl = process.env.AMQP_URL || "amqp://localhost:5672";

const app = express();
const urlencodedParser = express.urlencoded({ extended: false });

app.use(express.static("public"));

// определяем объект Sequelize
const sequelize = new Sequelize("effective_mobile_test", "postgres", "123", {
  dialect: "postgres",
  host: "localhost",
  port: "5432",
});

// определяем модель User
const User = sequelize.define("user", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  age: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

app.set("view engine", "hbs");

hbs.registerHelper("bold", function (options) {
  return '<span class="selected">' + options.fn(this) + "</span>";
});

hbs.registerHelper("ifCond", function (v1, v2, options) {
  if (v1 === v2) {
    return options.fn(this);
  }
  return options.inverse(this);
});

// синхронизация с бд, после успешной синхронизации запускаем сервер
sequelize
  .sync()
  .then(() => {
    app.listen(5000, function () {
      console.log("Users Server is waiting for connection...");
    });
  })
  .catch((err) => console.log(err));

// получение данных
app.get("/", function (req, res) {
  const pageAsNumber = Number.parseInt(req.query.page);
  // const sizeAsNumber = Number.parseInt(req.query.size);

  let page = 1;
  if (!Number.isNaN(pageAsNumber) && pageAsNumber > 0) {
    page = pageAsNumber;
  }
  let size = 3;
  // if (!Number.isNaN(sizeAsNumber) && sizeAsNumber > 0 && sizeAsNumber < 5) {
  //   size = sizeAsNumber;
  // }

  User.findAndCountAll({
    limit: size,
    offset: (page - 1) * size,
    raw: true,
    order: [["id", "ASC"]],
  })
    .then((data) => {
      const totalPages = Math.ceil(data.count / size);
      const pages = [];
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      res.render("index.hbs", {
        users: data.rows,
        pages: pages,
        page: page,
      });
    })
    .catch((err) => console.log(err));
});

app.get("/create", function (req, res) {
  res.render("create.hbs");
});

async function connect(userID, updateType) {
  try {
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();
    channel.assertQueue("event.shipped", { durable: true });
    channel.sendToQueue(
      "event.shipped",
      Buffer.from(
        JSON.stringify({
          userID: userID,
          type: updateType,
        })
      )
    );
  } catch (error) {
    console.log({ error });
  }
}

// добавление данных
app.post("/create", urlencodedParser, function (req, res) {
  if (!req.body) return res.sendStatus(400);

  const username = req.body.name;
  const userage = req.body.age;
  User.create({ name: username, age: userage })
    .then(async (res) => {
      connect(res.id, "created");
    })
    .then(() => {
      res.redirect("/");
    })
    .catch((err) => console.log(err));
});

// получаем объект по id для редактирования
app.get("/edit/:id", function (req, res) {
  const userid = req.params.id;
  User.findAll({ where: { id: userid }, raw: true })
    .then((data) => {
      res.render("edit.hbs", {
        user: data[0],
      });
    })
    .catch((err) => console.log(err));
});

// обновление данных в БД
app.post("/edit", urlencodedParser, function (req, res) {
  if (!req.body) return res.sendStatus(400);

  const username = req.body.name;
  const userage = req.body.age;
  const userid = req.body.id;
  User.update({ name: username, age: userage }, { where: { id: userid } })
    .then(async () => {
      connect(userid, "updated");
    })
    .then(() => {
      res.redirect("/");
    })
    .catch((err) => console.log(err));
});

// удаление данных
app.post("/delete/:id", function (req, res) {
  const userid = req.params.id;
  User.destroy({ where: { id: userid } })
    .then(async () => {
      connect(userid, "deleted");
    })
    .then(() => {
      res.redirect("/");
    })
    .catch((err) => console.log(err));
});
