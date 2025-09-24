// src/App.js
import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./firebase"; // your Firebase config

// Layout + Routes
import Layout from "./components/Config/layout";
import PrivateRoute from "./privateRoute";
import Login from "./components/login";

// Admin pages
import DashboardAdmin from "./components/Admin/dashboardAdmin";
import UnitTracking from "./components/Admin/unitTracking";
import UserManagement from "./components/Admin/userManagement";
import DriverDispatch from "./components/Admin/driverDispatch";
import VehicleManagement from "./components/Admin/vehicleManagement";
import TransactionOverview from "./components/Admin/Reports/transactionOverview";
import QuotaSummary from "./components/Admin/Reports/quotaSummary";
import TripLogs from "./components/Admin/Reports/tripLogs";

// Cashier pages
import DashboardCashier from "./components/Cashier/dashboardCashier";
import FuelLogs from "./components/Cashier/fuelLogs";

// Super Admin pages
import DashboardSuper from "./components/Super Admin/dashboardSuper";
import ActivityLogSuper from "./components/Super Admin/activityLogSuper";
import AdminManagement from "./components/Super Admin/AdminManagementSuper";
import RouteManagement from "./components/Super Admin/RouteManagementSuper";
import QuotaManagement from "./components/Super Admin/QuotaManagementSuper";
import UserAccess from "./components/Super Admin/UACSuper";
import PassRest from "./components/Super Admin/PasswordSuper";
import Maintenance from "./components/Super Admin/MaintenanceSuper";

const Forbidden = () => (
  <div style={{ padding: 24 }}>
    <h1>403 — Forbidden</h1>
    <p>You don’t have permission to view this page.</p>
  </div>
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔑 Listen to Firebase Auth and load Firestore user document
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            ...snap.data(), // should include role + permissions
          });
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <Router>
      <Routes>
        {/* Public Route */}
        <Route path="/login" element={<Login />} />

        {/* Protected Layout */}
        <Route
          path="/"
          element={
            <PrivateRoute
              allowedRoles={["Admin", "Cashier", "Super"]}
              user={user}
            >
              <Layout user={user} />
            </PrivateRoute>
          }
        >
          {/* Admin Routes */}
          <Route
            path="dashboardAdmin"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Dashboard Admin"
                user={user}
              >
                <DashboardAdmin />
              </PrivateRoute>
            }
          />
          <Route
            path="unitTracking"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Unit Tracking"
                user={user}
              >
                <UnitTracking />
              </PrivateRoute>
            }
          />
          <Route
            path="userManagement"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="User Management"
                user={user}
              >
                <UserManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="driverDispatch"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Driver Dispatch"
                user={user}
              >
                <DriverDispatch />
              </PrivateRoute>
            }
          />
          <Route
            path="vehicleManagement"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Vehicle Management"
                user={user}
                loading={loading}
              >
                <VehicleManagement />
              </PrivateRoute>
            }
          />

          <Route
            path="Reports/transactionOverview"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Reports"
                user={user}
              >
                <TransactionOverview />
              </PrivateRoute>
            }
          />
          <Route
            path="Reports/quotaSummary"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Reports"
                user={user}
              >
                <QuotaSummary />
              </PrivateRoute>
            }
          />
          <Route
            path="Reports/tripLogs"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Reports"
                user={user}
              >
                <TripLogs />
              </PrivateRoute>
            }
          />

          {/* Cashier Routes */}
          <Route
            path="dashboardCashier"
            element={
              <PrivateRoute
                allowedRoles={["Cashier"]}
                requiredPermission="View Dashboard"
                user={user}
              >
                <DashboardCashier />
              </PrivateRoute>
            }
          />
          <Route
            path="fuelLogs"
            element={
              <PrivateRoute
                allowedRoles={["Cashier"]}
                requiredPermission="Fuel Logs"
                user={user}
              >
                <FuelLogs />
              </PrivateRoute>
            }
          />

          {/* Super Admin Routes */}
          <Route
            path="dashboardSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Super Dashboard"
                user={user}
              >
                <DashboardSuper />
              </PrivateRoute>
            }
          />
          <Route
            path="activityLogSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="View Activity Log"
                user={user}
              >
                <ActivityLogSuper />
              </PrivateRoute>
            }
          />
          <Route
            path="AdminManagementSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Admins"
                user={user}
              >
                <AdminManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="RouteManagementSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Routes"
                user={user}
              >
                <RouteManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="QuotaManagementSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Quotas"
                user={user}
              >
                <QuotaManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="UACSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage User Access"
                user={user}
              >
                <UserAccess />
              </PrivateRoute>
            }
          />
          <Route
            path="PasswordSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Password Reset"
                user={user}
              >
                <PassRest />
              </PrivateRoute>
            }
          />
          <Route
            path="MaintenanceSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Maintenance"
                user={user}
              >
                <Maintenance />
              </PrivateRoute>
            }
          />
        </Route>

        {/* Forbidden + catch-all */}
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
