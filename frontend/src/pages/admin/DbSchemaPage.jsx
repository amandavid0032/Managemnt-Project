import React, { useEffect } from "react";

/**
 * TEMPORARY: shows public/db-schema.html (tables, relations, full SQL) inside
 * the admin shell. To remove: delete this file, public/db-schema.html, the
 * "db-schema" route in App.js and the "Database Schema" item in adminNav.js.
 */
const DbSchemaPage = () => {
  useEffect(() => {
    document.title = "Database Schema · EduHub Admin";
  }, []);

  return (
    <iframe
      title="Database schema"
      src={`${process.env.PUBLIC_URL || ""}/db-schema.html`}
      className="h-[calc(100vh-9rem)] w-full rounded-xl border border-slate-200 bg-white"
    />
  );
};

export default DbSchemaPage;
