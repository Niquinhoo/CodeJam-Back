import { Router } from "express";
import { getResultado, getTrabajo, putTrabajo } from "../controllers/trabajoController.js";

export const trabajoRoutes = Router()
  .put("/trabajos/:id",putTrabajo)
  .get("/trabajos/:id",getTrabajo)
  .get("/trabajos/:id/resultado",getResultado);
