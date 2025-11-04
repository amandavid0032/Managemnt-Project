import React from "react";

const TeacherPostCard = ({ teacher }) => (
  <div className="bg-white p-5 rounded-xl shadow-md hover:shadow-lg transition hover:scale-105 transform duration-300">
    <div className="flex items-center mb-3">
      <img
        src={teacher.image}
        alt={teacher.name}
        className="w-12 h-12 rounded-full object-cover border-2 border-blue-400 mr-3"
      />
      <div>
        <p className="font-semibold text-gray-900">{teacher.name}</p>
        <p className="text-sm text-gray-500">{teacher.subject}</p>
      </div>
    </div>
    <p className="text-gray-700 text-sm italic">"{teacher.post}"</p>
  </div>
);

export default TeacherPostCard;
