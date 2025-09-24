import React from "react";
import { Navigate, Outlet } from "react-router-dom";

const PrivateRoute = ({
  allowedRoles,
  requiredPermission,
  user,
  children,
  loading,
}) => {
  if (loading) return <p>Loading...</p>; // <-- wait until auth state is loaded

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  if (requiredPermission && !user.permissions?.includes(requiredPermission)) {
    return <Navigate to="/forbidden" replace />;
  }

  return children ? children : <Outlet />;
};

export default PrivateRoute;
