// Icons (you can keep your current imports)
import IconADashboard from "../../images/Dashboard White.png";
import IconUnit from "../../images/Monitoring White.png";
import IconUser from "../../images/Admin.png";
import IconDriver from "../../images/Driver White.png";
import IconVehicle from "../../images/Vehicle White.png";
import IconReport from "../../images/Report.png";

import IconADashboardActive from "../../images/Dashboard Blue.png";
import IconUnitActive from "../../images/Monitoring Blue.png";
import IconUserActive from "../../images/Admin Blue.png";
import IconDriverActive from "../../images/Driver Blue.png";
import IconVehicleActive from "../../images/Vehicle Blue.png";
import IconReportActive from "../../images/Reports Blue.png";

import IconSDashboard from "../../images/Dashboard White.png";
import IconActivity from "../../images/Activity White.png";
import IconAdmin from "../../images/Admin.png";
import IconMap from "../../images/Map White.png";
import IconQuota from "../../images/Quota.png";
import IconUAC from "../../images/UAC White.png";
import IconKey from "../../images/key.png";
import IconMaintenance from "../../images/Maintenance White.png";

import IconSDashboardActive from "../../images/Dashboard Blue.png";
import IconActivityActive from "../../images/Activity Log Blue.png";
import IconAdminActive from "../../images/Admin Blue.png";
import IconMapActive from "../../images/map.png";
import IconQuotaActive from "../../images/Quota Blue.png";
import IconUACActive from "../../images/UAC Blue.png";
import IconKeyActive from "../../images/key blue.png";
import IconMaintenanceActive from "../../images/Maintenance Blue.png";

export const navLinks = [
  // Super Admin
  {
    to: "/dashboardSuper",
    label: "Dashboard",
    role: "Super",
    permission: "Super Dashboard",
    img: { inactive: IconSDashboard, active: IconSDashboardActive },
  },
  {
    to: "/activityLogSuper",
    label: "Activity Log",
    role: "Super",
    permission: "View Activity Log",
    img: { inactive: IconActivity, active: IconActivityActive },
  },
  {
    to: "/AdminManagementSuper",
    label: "Admin Management",
    role: "Super",
    permission: "Manage Admins",
    img: { inactive: IconAdmin, active: IconAdminActive },
  },
  {
    to: "/RouteManagementSuper",
    label: "Route Management",
    role: "Super",
    permission: "Manage Routes",
    img: { inactive: IconMap, active: IconMapActive },
  },
  {
    to: "/QuotaManagementSuper",
    label: "Quota Management",
    role: "Super",
    permission: "Manage Quotas",
    img: { inactive: IconQuota, active: IconQuotaActive },
  },
  {
    to: "/UACSuper",
    label: "User Access Control",
    role: "Super",
    permission: "Manage User Access",
    img: { inactive: IconUAC, active: IconUACActive },
  },
  {
    to: "/PasswordSuper",
    label: "Password Reset",
    role: "Super",
    permission: "Password Reset",
    img: { inactive: IconKey, active: IconKeyActive },
  },
  {
    to: "/MaintenanceSuper",
    label: "Maintenance",
    role: "Super",
    permission: "Manage Maintenance",
    img: { inactive: IconMaintenance, active: IconMaintenanceActive },
  },

  // Admin
  {
    to: "/dashboardAdmin",
    label: "Dashboard",
    role: "Admin",
    permission: "Dashboard Admin",
    img: { inactive: IconADashboard, active: IconADashboardActive },
  },
  {
    to: "/unitTracking",
    label: "Unit Tracking",
    role: "Admin",
    permission: "Unit Tracking",
    img: { inactive: IconUnit, active: IconUnitActive },
  },
  {
    to: "/userManagement",
    label: "User Management",
    role: "Admin",
    permission: "User Management",
    img: { inactive: IconUser, active: IconUserActive },
  },
  {
    to: "/driverDispatch",
    label: "Driver Dispatch",
    role: "Admin",
    permission: "Driver Dispatch",
    img: { inactive: IconDriver, active: IconDriverActive },
  },
  {
    to: "/vehicleManagement",
    label: "Vehicle Management",
    role: "Admin",
    permission: "Vehicle Management",
    img: { inactive: IconVehicle, active: IconVehicleActive },
  },

  {
    label: "Reports",
    role: "Admin",
    permission: "Reports",
    img: { inactive: IconReport, active: IconReportActive },
    children: [
      {
        to: "/Reports/transactionOverview",
        label: "Transaction Overview",
        role: "Admin",
        permission: "Reports",
        img: { inactive: IconReport, active: IconReportActive }, // to change icon
      },
      {
        to: "/Reports/quotaSummary",
        label: "Quota Summary",
        role: "Admin",
        permission: "Reports",
        img: { inactive: IconReport, active: IconReportActive }, // to change icon
      },
      {
        to: "/Reports/tripLogs",
        label: "Trip Logs",
        role: "Admin",
        permission: "Reports",
        img: { inactive: IconReport, active: IconReportActive }, // to change icon
      },
    ],
  },

  // Cashier
  {
    to: "/dashboardCashier",
    label: "Dashboard",
    role: "Cashier",
    permission: "View Dashboard",
    img: { inactive: IconSDashboard, active: IconSDashboardActive },
  },
  {
    to: "/fuelLogs",
    label: "Fuel Logs",
    role: "Cashier",
    permission: "Fuel Logs",
    img: { inactive: IconActivity, active: IconActivityActive },
  },
];
