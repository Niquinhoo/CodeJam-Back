import { Router } from "express";
import { postResolver } from "../controllers/resolverController.js";

export const resolverRoutes = Router().post("/resolver", postResolver);
