import { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { auth, db } from "./firebase";

// Layout + Routes
import Layout from "./components/Config/layout";
import PrivateRoute from "./privateRoute";
import Login from "./components/login";
import Forbidden from "./components/Forbidden";

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

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);

        setUser(
          snap.exists()
            ? {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                ...snap.data(),
              }
            : null
        );

        // Don't set isLogged here - it will be set in login.js when user actually logs in
      } else {
        setUser(null);
      }
      setLoading(false);
      setInitialLoad(false);
    });

    return () => unsub();
  }, []);

  // Handle tab close/browser close - set isLogged to false
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (user && user.uid) {
        const ref = doc(db, "users", user.uid);
        
        // Set isLogged to false when tab/browser closes
        await updateDoc(ref, {
          isLogged: false,
          lastLogoutTime: new Date().toISOString()
        });

        // Sign out the user
        await signOut(auth);
      }
    };

    // Add event listener for tab/window close
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [user]);

  // Only show blank screen on initial page load, not on refreshes
  if (initialLoad && loading) {
    return <div style={{ opacity: 0 }}></div>;
  }

  return (
    <Router>
      <Routes>
        {/* Default route - shows login page */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Layout */}
        <Route
          element={
            <PrivateRoute
              allowedRoles={["Admin", "Cashier", "Super"]}
              user={user}
              loading={loading}
            >
              <Layout user={user} />
            </PrivateRoute>
          }
        >
          {/* Admin Routes */}
          <Route
            path="/dashboardAdmin"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Dashboard Admin"
                user={user}
                loading={loading}
              >
                <DashboardAdmin />
              </PrivateRoute>
            }
          />
          <Route
            path="/unitTracking"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Unit Tracking"
                user={user}
                loading={loading}
              >
                <UnitTracking />
              </PrivateRoute>
            }
          />
          <Route
            path="/userManagement"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="User Management"
                user={user}
                loading={loading}
              >
                <UserManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="/driverDispatch"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Driver Dispatch"
                user={user}
                loading={loading}
              >
                <DriverDispatch />
              </PrivateRoute>
            }
          />
          <Route
            path="/vehicleManagement"
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
            path="/Reports/transactionOverview"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Reports"
                user={user}
                loading={loading}
              >
                <TransactionOverview />
              </PrivateRoute>
            }
          />
          <Route
            path="/Reports/quotaSummary"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Reports"
                user={user}
                loading={loading}
              >
                <QuotaSummary />
              </PrivateRoute>
            }
          />
          <Route
            path="/Reports/tripLogs"
            element={
              <PrivateRoute
                allowedRoles={["Admin"]}
                requiredPermission="Reports"
                user={user}
                loading={loading}
              >
                <TripLogs />
              </PrivateRoute>
            }
          />

          {/* Cashier Routes */}
          <Route
            path="/dashboardCashier"
            element={
              <PrivateRoute
                allowedRoles={["Cashier"]}
                requiredPermission="View Dashboard"
                user={user}
                loading={loading}
              >
                <DashboardCashier />
              </PrivateRoute>
            }
          />
          <Route
            path="/fuelLogs"
            element={
              <PrivateRoute
                allowedRoles={["Cashier"]}
                requiredPermission="Fuel Logs"
                user={user}
                loading={loading}
              >
                <FuelLogs />
              </PrivateRoute>
            }
          />

          {/* Super Admin Routes */}
          <Route
            path="/dashboardSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Super Dashboard"
                user={user}
                loading={loading}
              >
                <DashboardSuper />
              </PrivateRoute>
            }
          />
          <Route
            path="/activityLogSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="View Activity Log"
                user={user}
                loading={loading}
              >
                <ActivityLogSuper />
              </PrivateRoute>
            }
          />
          <Route
            path="/AdminManagementSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Admins"
                user={user}
                loading={loading}
              >
                <AdminManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="/RouteManagementSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Routes"
                user={user}
                loading={loading}
              >
                <RouteManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="/QuotaManagementSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Quotas"
                user={user}
                loading={loading}
              >
                <QuotaManagement />
              </PrivateRoute>
            }
          />
          <Route
            path="/UACSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage User Access"
                user={user}
                loading={loading}
              >
                <UserAccess />
              </PrivateRoute>
            }
          />
          <Route
            path="/PasswordSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Password Reset"
                user={user}
                loading={loading}
              >
                <PassRest />
              </PrivateRoute>
            }
          />
          <Route
            path="/MaintenanceSuper"
            element={
              <PrivateRoute
                allowedRoles={["Super"]}
                requiredPermission="Manage Maintenance"
                user={user}
                loading={loading}
              >
                <Maintenance />
              </PrivateRoute>
            }
          />
        </Route>

        {/* Forbidden + Catch-all */}
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;