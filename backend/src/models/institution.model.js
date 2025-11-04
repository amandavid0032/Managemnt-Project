// src/models/institution.model.js
import mongoose from "mongoose";

const institutionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true }, // School, College, etc.
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    country: { type: String },
    state: { type: String },
    city: { type: String },
    address: { type: String },
    imageUrls: [{ type: String }],

    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: function () {
        return (Math.random() * 2 + 3).toFixed(1); // random between 3.0 and 5.0
      },
    },

    description: { type: String },

    awards: [
      {
        title: { type: String },
        year: { type: Number },
        issuedBy: { type: String },
      },
    ],
  },
  { timestamps: true }
);

const Institution = mongoose.model("Institution", institutionSchema);

// ---------- MODEL QUERIES ----------
export const findAllInstitutions = async (limit = 50) => {
  return await Institution.find().limit(limit);
};

export const findInstitutionById = async (id) => {
  return await Institution.findById(id);
};

export const createInstitution = async (data) => {
  return await Institution.create(data);
};

export const updateInstitution = async (id, data) => {
  return await Institution.findByIdAndUpdate(id, data, { new: true });
};

export const deleteInstitution = async (id) => {
  return await Institution.findByIdAndDelete(id);
};

export default Institution;
