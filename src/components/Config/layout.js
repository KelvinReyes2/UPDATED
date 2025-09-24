import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./sidebar";

const Layout = ({ user }) => {
  return (
    <div className="flex h-screen">
      {/* Sidebar fixed */}
      <Sidebar user={user} />

      {/* Main content */}
      <main
        className="flex-1 overflow-y-auto transition-all duration-300"
        style={{
          marginLeft: "var(--sidebar-width, 16rem)", // respects sidebar width
        }}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
