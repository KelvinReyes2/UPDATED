import React from "react";
import { Link } from "react-router-dom";

const Forbidden = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-blue-50 px-4">
      <div className="bg-white shadow-xl rounded-2xl p-10 text-center max-w-md">
        <div className="text-blue-500 text-6xl font-bold mb-4 animate-bounce">
          🚫
        </div>
        <h1 className="text-2xl font-semibold mb-2">Oops! Not Here</h1>
        <p className="text-gray-600 mb-6">
          Looks like you’ve stumbled on a page that’s not for you. Don’t
          worry—let’s get you back on track!
        </p>
        <Link
          to="/login"
          className="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg font-medium shadow hover:bg-blue-600 transition"
        >
          Take Me to Login
        </Link>
      </div>
    </div>
  );
};

export default Forbidden;