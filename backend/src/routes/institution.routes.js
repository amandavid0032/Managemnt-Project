import express from "express";
import {
  getAllInstitutions,
  getInstitutionById,
  createInstitutionController,
  updateInstitutionController,
  deleteInstitutionController,
} from "../controllers/institution.controller.js";

const router = express.Router();

router.get("/", getAllInstitutions);
router.get("/:id", getInstitutionById);
router.post("/", createInstitutionController);
router.put("/:id", updateInstitutionController);
router.delete("/:id", deleteInstitutionController);

export default router;
