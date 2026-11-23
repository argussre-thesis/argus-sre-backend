import express from "express";
import {
  returnProfileData,
  updateProfileData,
} from "../controller/user.controller";
import { validateBody } from "../middleware/validateSchema";
import { updateProfileSchema } from "../schemas/profile.schema";

const profileRoutes = express.Router();

profileRoutes.get("/", returnProfileData);
profileRoutes.patch("/", validateBody(updateProfileSchema), updateProfileData);

export default profileRoutes;
