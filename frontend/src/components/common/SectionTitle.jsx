import React from "react";

const SectionTitle = ({ title, subtitle }) => (
  <div className="mb-8 text-center">
    <h2 className="text-3xl font-bold text-gray-800">{title}</h2>
    {subtitle && <p className="text-gray-600 mt-2">{subtitle}</p>}
  </div>
);

export default SectionTitle;
