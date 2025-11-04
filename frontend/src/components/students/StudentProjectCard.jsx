import React from "react";

const StudentProjectCard = ({ project }) => (
  <a href={project.link} className="bg-white rounded-xl shadow-md hover:shadow-lg transform hover:scale-105 overflow-hidden block">
    <img src={project.image} alt={project.title} className="w-full h-44 object-cover" />
    <div className="p-4">
      <h3 className="text-lg font-semibold text-gray-900">{project.title}</h3>
      <p className="text-gray-600 text-sm mt-1">by {project.author}</p>
      <p className="text-gray-700 text-sm mt-2">{project.summary}</p>
    </div>
  </a>
);

export default StudentProjectCard;
