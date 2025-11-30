import {
  findAllInstitutions,
  findInstitutionById,
  createInstitution,
  updateInstitution,
  deleteInstitution,
findInstitutionsByType
} from "../models/institution.model.js";

// ✅ Get all institutions
export const getAllInstitutions = async (req, res) => {   
  try {
    const institutions = await findAllInstitutions();
    res.status(200).json({
      success: true,
      count: institutions.length,
      data: institutions,
    });
  } catch (error) {
    console.error("Error fetching institutions:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Get institution by ID
export const getInstitutionById = async (req, res) => {
  try {
    const institution = await findInstitutionById(req.params.id);
    if (!institution)
      return res.status(404).json({ success: false, message: "Institution not found" });

    res.status(200).json({ success: true, data: institution });
  } catch (error) {
    console.error("Error fetching institution:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Create institution
export const createInstitutionController = async (req, res) => {
  try {
    const newInstitution = await createInstitution(req.body);
    res.status(201).json({ success: true, data: newInstitution });
  } catch (error) {
    console.error("Error creating institution:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Update institution
export const updateInstitutionController = async (req, res) => {
  try {
    const updated = await updateInstitution(req.params.id, req.body);
    if (!updated)
      return res.status(404).json({ success: false, message: "Institution not found" });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating institution:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Delete institution
export const deleteInstitutionController = async (req, res) => {
  try {
    const deleted = await deleteInstitution(req.params.id);
    if (!deleted)
      return res.status(404).json({ success: false, message: "Institution not found" });

    res.status(200).json({ success: true, message: "Institution deleted successfully" });
  } catch (error) {
    console.error("Error deleting institution:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};



// controller
export const getInstitutionsByType = async (req, res) => {
  try {
    const type = req.query.type; // /institutions/type?type=Polytechnic
    if (!type) {
      return res.status(400).json({ success: false, message: "Type is required" });
    }

    const institutions = await findInstitutionsByType(type);

    res.status(200).json({
      success: true,
      count: institutions.length,
      data: institutions,
    });
  } catch (error) {
    console.error("Error fetching institutions by type:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
