require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const logger = require("./utils/logger");
const helmet = require("helmet");
const cors = require("cors");
const Redis = require("ioredis");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const authRoute = require("./routes/identity-service");
const errorHandler = require("./middleware/errorHandler");
const { RateLimiterRedis } = require("rate-limiter-flexible");

const app = express();
const PORT = process.env.PORT || 3001;

// connect to mongodb
mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => logger.info("Connected to mongodb"))
  .catch((e) => logger.error("Mongo connection error", e));

const redisClient = new Redis(process.env.REDIS_URL);

// middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`Received ${res.method} request to ${req.url}`);
  logger.info(`Request body : ${JSON.stringify(req.body)}`);
  next();
});

// DDos protection and rate limiting
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: 10,
  duration: 1,
});

app.use((req, res, next) => {
  rateLimiter
    .consume(req.ip)
    .then(() => next())
    .catch(() => {
      logger.warn(`Rate limit exceeded for ${req.ip}`);
      res.status(429).send({ error: "Too many requests" });
    });
});

// Ip based rate limiting for sensitive endpoints
const sensitiveEndpointLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    logger.warn(`sensitive endpoint rate limit exceeded for ${req.ip}`);
    res.status(429).send({ error: "Too many requests" });
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }), // using redis as the store
});

// apply this sensitiveEndpointLimiter to our routes
app.use("/api/auth/register", sensitiveEndpointLimiter);

// routes
app.use("/api/auth", authRoute);

// error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Identity service listening on port ${PORT}`);
});

// unhandled promise rejection

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
