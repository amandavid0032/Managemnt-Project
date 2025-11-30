import React from "react";
import { FaMapMarkerAlt } from "react-icons/fa";

const Header = () => {
  return (
    <header className="bg-white shadow-md py-4 px-6 flex flex-col sm:flex-row justify-between items-center sticky top-0 z-50">
      <h1 className="text-3xl font-extrabold text-blue-800 mb-2 sm:mb-0">
        MyCampus Hub
      </h1>
      <div className="flex items-center space-x-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search schools or colleges..."
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <FaMapMarkerAlt className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
        <button className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition">
          Profile
        </button>
      </div>
    </header>
  );
};

export default Header;
