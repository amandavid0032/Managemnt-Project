import React from "react";
import { FaStar, FaMapMarkerAlt } from "react-icons/fa";

const SchoolCard = ({ school }) => (
  <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition transform hover:scale-105 overflow-hidden">
    <img src={school.image} alt={school.name} className="w-full h-48 object-cover" />
    <div className="p-5">
      <h3 className="text-xl font-semibold text-gray-900">{school.name}</h3>
      <p className="text-gray-600 text-sm mt-1 flex items-center">
        <FaMapMarkerAlt className="text-red-500 mr-1" /> {school.location}
      </p>
      <p className="text-gray-700 mt-2 text-sm">{school.description}</p>
      <div className="flex items-center mt-3 text-yellow-500">
        {[...Array(Math.round(school.rating))].map((_, i) => (
          <FaStar key={i} />
        ))}
        <span className="ml-2 text-gray-600 text-sm">{school.rating}/5</span>
      </div>
    </div>
  </div>
);

export default SchoolCard;
