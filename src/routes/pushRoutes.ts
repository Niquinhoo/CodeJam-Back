import { Router } from "express";
import { deleteSuscripcion, getPushConfig, putSuscripcion } from "../controllers/pushController.js";

export const pushRoutes = Router()
  .get("/push/config",getPushConfig)
  .put("/push/suscripcion",putSuscripcion)
  .delete("/push/suscripcion",deleteSuscripcion);
