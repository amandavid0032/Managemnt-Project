import React from "react";

const StudentProjectCard = ({ project }) => (
  <a
    href={project.link}
    className="rounded-lg shadow-md hover:shadow-lg transition-all duration-300 bg-white overflow-hidden block"
  >
    {/* Image */}
    <div className="relative w-full h-48 sm:h-52 md:h-56">
      <img
        src={project.image}
        alt={project.title}
        className="w-full h-full object-cover"
      />
    </div>

    {/* Content */}
    <div className="p-4">
      <h3 className="text-lg font-semibold text-gray-800 line-clamp-1">
        {project.title}
      </h3>

      <p className="text-gray-600 text-sm mt-1">
        by {project.author}
      </p>

      <p className="text-gray-700 text-sm mt-2 line-clamp-2">
        {project.summary}
      </p>
    </div>
  </a>
);

export default StudentProjectCard;
