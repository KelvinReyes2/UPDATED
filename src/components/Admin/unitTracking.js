import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MapPin,
  Search,
  Eye,
  Calendar,
  User,
  Truck,
  Route,
  Clock,
  Navigation,
  X,
} from "lucide-react";
import { db } from "../../firebase";
import { collection, onSnapshot } from "firebase/firestore";

export default function UnitTracking() {
  const [unitTrackingData, setUnitTrackingData] = useState([]);
  const [unitsData, setUnitsData] = useState([]);
  const [usersData, setUsersData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState("All Routes");
  const [searchTerm, setSearchTerm] = useState("");
  const [driverLogs, setDriverLogs] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef([]);

  // Check if a date is today
  const isToday = (date) => {
    const today = new Date();
    const checkDate = new Date(date);
    return (
      checkDate.getDate() === today.getDate() &&
      checkDate.getMonth() === today.getMonth() &&
      checkDate.getFullYear() === today.getFullYear()
    );
  };

  // Load Leaflet resources
  useEffect(() => {
    if (typeof window !== "undefined" && !window.L) {
      // Load Leaflet CSS
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);

      // Load Leaflet JS
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.async = true;
      script.onload = () => {
        setLeafletLoaded(true);
      };
      script.onerror = () => {
        console.error("Failed to load Leaflet");
      };
      document.head.appendChild(script);
    } else if (window.L) {
      setLeafletLoaded(true);
    }
  }, []);

  // Fetch unit tracking data
  useEffect(() => {
    const unsubUnitTracking = onSnapshot(
      collection(db, "unitTracking"),
      (snap) => {
        const temp = [];
        snap.forEach((doc) => {
          const data = doc.data();
          temp.push({
            id: doc.id,
            unitId: data.unitID || "Unknown Unit",
            route: data.route || "No Route",
            vehicleStatus: data.status || "Unknown",
            updatedAt: data.updatedAt?.toDate() || new Date(),
            createdAt:
              data.createdAt?.toDate() ||
              data.updatedAt?.toDate() ||
              new Date(),
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
          });
        });
        setUnitTrackingData(temp);
        setIsLoading(false);
      }
    );
    return () => unsubUnitTracking();
  }, []);

  // Fetch units data including unitHolder, vehicleID, and status
  useEffect(() => {
    const unsubUnits = onSnapshot(collection(db, "unit"), (snap) => {
      const temp = [];
      snap.forEach((doc) => {
        const data = doc.data();
        temp.push({
          id: doc.id,
          unitHolder: data.unitHolder || null,
          vehicleID: data.vehicleID || "Unknown Vehicle ID",
          status: data.status || null,
        });
      });
      setUnitsData(temp);
    });
    return () => unsubUnits();
  }, []);

  // Fetch users data to get firstName, middleName, lastName
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const temp = [];
      snap.forEach((doc) => {
        const data = doc.data();
        temp.push({
          id: doc.id,
          firstName: data.firstName || "",
          middleName: data.middleName || "",
          lastName: data.lastName || "",
        });
      });
      setUsersData(temp);
    });
    return () => unsubUsers();
  }, []);

  useEffect(() => {
    const unsubLogs = onSnapshot(collection(db, "driverLogs"), (snap) => {
      const temp = [];
      snap.forEach((doc) => {
        const data = doc.data();
        temp.push({
          id: doc.id,
          personnelID: data.personnelID,
          particular: data.Particular,
          route: data.Route,
          timestamp: data.Timestamp?.toDate() || new Date(),
        });
      });
      setDriverLogs(temp);
    });

    return () => unsubLogs();
  }, []);

  // Get the driver's full name by matching unitHolder with user document ID
  const getDriverName = useCallback(
    (unitHolder) => {
      if (!unitHolder) return "Unknown Driver";

      const user = usersData.find((user) => user.id === unitHolder);

      if (user) {
        const parts = [user.firstName, user.middleName, user.lastName].filter(
          (part) => part && part.trim()
        );
        return parts.join(" ") || "No Name Found";
      }

      return "No Driver Found";
    },
    [usersData]
  );

  // Get unique routes for filtering - only for units with updatedAt today
  const getUniqueRoutes = useCallback(() => {
    const todayUnits = unitTrackingData.filter((trackingUnit) =>
      isToday(trackingUnit.updatedAt)
    );
    const routes = todayUnits.map((unit) => unit.route);
    return ["All Routes", ...new Set(routes)];
  }, [unitTrackingData]);

  const getParticular = useCallback(
    (unitHolder) => {
      if (!unitHolder) return "No Particular";

      const logs = driverLogs.filter((dl) => dl.personnelID === unitHolder);

      if (logs.length === 0) return "No Particular";

      // Find latest log
      const latestLog = logs.reduce((prev, curr) =>
        curr.timestamp > prev.timestamp ? curr : prev
      );

      return latestLog.particular || "No Particular";
    },
    [driverLogs]
  );

  const getStatusInfo = useCallback((status) => {
    switch ((status || "").toLowerCase()) {
      case "active":
      case "moving":
        return {
          color: "bg-green-500",
          text: "Active",
          textColor: "text-green-700",
          bgColor: "bg-green-50",
        };
      case "idle":
        return {
          color: "bg-gray-500",
          text: "Idle",
          textColor: "text-gray-700",
          bgColor: "bg-gray-50",
        };
      case "stop":
        return {
          color: "bg-red-500",
          text: "Stop",
          textColor: "text-red-700",
          bgColor: "bg-red-50",
        };
      default:
        return {
          color: "bg-gray-500",
          text: "Unknown",
          textColor: "text-gray-700",
          bgColor: "bg-gray-50",
        };
    }
  }, []);

  const mergedDataTracking = useMemo(() => {
    return unitTrackingData.map((ut) => {
      const unitInfo = unitsData.find((u) => u.id === ut.unitId) || {};

      return {
        ...ut,
        vehicleId: unitInfo.vehicleID || "Unknown Vehicle",
        unitHolder: unitInfo.unitHolder || null,
        unitName: ut.unitId || "Unknown Unit",
        status: ut.vehicleStatus,
      };
    });
  }, [unitTrackingData, unitsData]);

  // Get time ago format
  const getTimeAgo = useCallback((date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  }, []);

  const updateMapMarkers = useCallback(() => {
    if (!leafletMap.current || !window.L) return;

    markersRef.current.forEach((marker) =>
      leafletMap.current.removeLayer(marker)
    );
    markersRef.current = [];

    const filteredUnits = mergedDataTracking
      .filter((ut) => isToday(ut.updatedAt))
      .filter(
        (ut) => selectedRoute === "All Routes" || ut.route === selectedRoute
      )
      .filter(
        (ut) =>
          !searchTerm ||
          ut.unitId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ut.route.toLowerCase().includes(searchTerm.toLowerCase())
      );

    if (filteredUnits.length === 0) return;

    filteredUnits.forEach((unitTracking) => {
      const unitHolderId = unitTracking.unitHolder;
      const vehicleId = unitTracking.vehicleId || unitTracking.unitId;
      const isSelected = selectedUnit && selectedUnit.id === unitTracking.id;

      const driverName = unitHolderId
        ? getDriverName(unitHolderId)
        : "No Driver Found";

      const statusInfo = getStatusInfo(unitTracking.status || "idle");
      const statusLower = (unitTracking.status || "").toLowerCase();

      // Determine icon color and animation based on vehicle status
      let iconColor, pulseAnimation, vehicleAnimation;
      
      if (statusLower === "active" || statusLower === "moving") {
        iconColor = "#10b981"; // green
        pulseAnimation = `<animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite"/>`;
        vehicleAnimation = `<animateTransform attributeName="transform" type="translate" values="0,0; 3,0; 0,0; -3,0; 0,0" dur="2s" repeatCount="indefinite"/>`;
      } else if (statusLower === "stop") {
        iconColor = "#ef4444"; // red
        pulseAnimation = `<animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>`;
        vehicleAnimation = ''; // No movement for stopped vehicles
      } else {
        iconColor = "#6b7280"; // gray (idle)
        pulseAnimation = `<animate attributeName="opacity" values="0.7;0.3;0.7" dur="3s" repeatCount="indefinite"/>`;
        vehicleAnimation = `<animateTransform attributeName="transform" type="scale" values="1;1.05;1" dur="4s" repeatCount="indefinite"/>`;
      }

      // Larger icon size - 48x48
      const iconSize = 48;
      
      // Vehicle icon SVG with animations - bigger and more appealing
     const customIcon = window.L.divIcon({
      className: "custom-vehicle-icon",
      html: `
        <div style="position: relative; width: ${iconSize}px; height: ${iconSize}px;">
          <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 48 48" style="overflow: visible;">
            <defs>
              <linearGradient id="vehicleGrad-${unitTracking.id}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:${iconColor};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${iconColor};stop-opacity:0.7" />
              </linearGradient>
              <linearGradient id="highlightGrad-${unitTracking.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:rgba(255,255,255,0.3);stop-opacity:1" />
                <stop offset="100%" style="stop-color:rgba(255,255,255,0.1);stop-opacity:0.5" />
              </linearGradient>
              <filter id="shadow-${unitTracking.id}" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)" flood-opacity="0.6"/>
              </filter>
              <filter id="glow-${unitTracking.id}">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            ${isSelected ? `
            <!-- Selection shadow -->
            <g transform="translate(2, 4)" opacity="0.6">
              <g filter="url(#shadow-${unitTracking.id})">
                <!-- Shadow vehicle body -->
                <rect x="10" y="20" width="28" height="16" rx="4" fill="rgba(0,0,0,0.3)" stroke="rgba(0,0,0,0.2)" stroke-width="1.5"/>
                <!-- Shadow vehicle cabin -->
                <rect x="13" y="14" width="22" height="10" rx="3" fill="rgba(0,0,0,0.3)" stroke="rgba(0,0,0,0.2)" stroke-width="1.5"/>
                <!-- Shadow wheels -->
                <circle cx="16" cy="36" r="3.5" fill="rgba(0,0,0,0.4)"/>
                <circle cx="32" cy="36" r="3.5" fill="rgba(0,0,0,0.4)"/>
              </g>
            </g>
            ` : ''}

            <!-- Main vehicle -->
            <g filter="url(#shadow-${unitTracking.id})" ${isSelected ? 'filter="url(#glow-' + unitTracking.id + ')"' : ''}>
              ${vehicleAnimation}
              
              <!-- Enhanced vehicle body with 3D effect -->
              <rect x="10" y="20" width="28" height="16" rx="4" fill="url(#vehicleGrad-${unitTracking.id})" stroke="white" stroke-width="2"/>
              <rect x="11" y="21" width="26" height="14" rx="3" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
              
              <!-- Vehicle cabin with highlights -->
              <rect x="13" y="14" width="22" height="10" rx="3" fill="url(#vehicleGrad-${unitTracking.id})" stroke="white" stroke-width="2"/>
              <rect x="14" y="15" width="20" height="8" rx="2" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
              
              <!-- Windshields with gradient -->
              <path d="M 13 19 L 15 15 L 21 15 L 21 19 Z" fill="rgba(173,216,230,0.6)" stroke="rgba(255,255,255,0.8)" stroke-width="1"/>
              <path d="M 27 15 L 33 15 L 35 19 L 27 19 Z" fill="rgba(173,216,230,0.6)" stroke="rgba(255,255,255,0.8)" stroke-width="1"/>
              
              <!-- Enhanced wheels with hubcaps -->
              <g>
                <!-- Front wheel -->
                <circle cx="16" cy="36" r="4" fill="#1a202c" stroke="white" stroke-width="1.5"/>
                <circle cx="16" cy="36" r="2.5" fill="#2d3748"/>
                <circle cx="16" cy="36" r="1.2" fill="rgba(255,255,255,0.8)"/>
                
                <!-- Back wheel -->
                <circle cx="32" cy="36" r="4" fill="#1a202c" stroke="white" stroke-width="1.5"/>
                <circle cx="32" cy="36" r="2.5" fill="#2d3748"/>
                <circle cx="32" cy="36" r="1.2" fill="rgba(255,255,255,0.8)"/>
              </g>
              
              <!-- Headlights with enhanced animation -->
              <g>
                <circle cx="12" cy="22" r="1.8" fill="#fef3c7" stroke="rgba(255,255,255,0.8)" stroke-width="0.5">
                  ${statusLower === "active" || statusLower === "moving" ? 
                    '<animate attributeName="fill" values="#fef3c7;#f59e0b;#fef3c7" dur="1.2s" repeatCount="indefinite"/>' : ''}
                </circle>
                <circle cx="12" cy="28" r="1.8" fill="#fef3c7" stroke="rgba(255,255,255,0.8)" stroke-width="0.5">
                  ${statusLower === "active" || statusLower === "moving" ? 
                    '<animate attributeName="fill" values="#fef3c7;#f59e0b;#fef3c7" dur="1.2s" repeatCount="indefinite"/>' : ''}
                </circle>
              </g>
              
              ${statusLower === "active" || statusLower === "moving" ? `
              <!-- Enhanced motion lines -->
              <g opacity="0.8">
                <line x1="4" y1="20" x2="8" y2="20" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round">
                  <animate attributeName="x1" values="4;2;4" dur="0.5s" repeatCount="indefinite"/>
                  <animate attributeName="x2" values="8;6;8" dur="0.5s" repeatCount="indefinite"/>
                </line>
                <line x1="4" y1="25" x2="8" y2="25" stroke="${iconColor}" stroke-width="2" stroke-linecap="round">
                  <animate attributeName="x1" values="4;2;4" dur="0.5s" begin="0.1s" repeatCount="indefinite"/>
                  <animate attributeName="x2" values="8;6;8" dur="0.5s" begin="0.1s" repeatCount="indefinite"/>
                </line>
                <line x1="4" y1="30" x2="8" y2="30" stroke="${iconColor}" stroke-width="1.5" stroke-linecap="round">
                  <animate attributeName="x1" values="4;2;4" dur="0.5s" begin="0.2s" repeatCount="indefinite"/>
                  <animate attributeName="x2" values="8;6;8" dur="0.5s" begin="0.2s" repeatCount="indefinite"/>
                </line>
              </g>
              ` : ''}
            </g>

            <!-- Status indicator with enhanced design -->
            <g transform="translate(40, 12)">
              <circle r="6" fill="white" stroke="white" stroke-width="3"/>
              <circle r="4.5" fill="${iconColor}" stroke="white" stroke-width="1.5">
                ${pulseAnimation}
              </circle>
              ${statusLower === "stop" ? `
              <!-- Pulsing warning ring -->
              <circle r="4.5" fill="none" stroke="${iconColor}" stroke-width="1.5" opacity="0.7">
                <animate attributeName="r" values="4.5;8;4.5" dur="1.8s" repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.7;0;0.7" dur="1.8s" repeatCount="indefinite"/>
              </circle>
              ` : ''}
            </g>

            <!-- Vehicle highlight effect -->
            <rect x="13" y="15" width="20" height="8" rx="2" fill="url(#highlightGrad-${unitTracking.id})"/>
          </svg>
        </div>
      `,
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize / 2, iconSize / 2],
    });

      const marker = window.L.marker(
        [unitTracking.latitude, unitTracking.longitude],
        { icon: customIcon }
      )
        .bindPopup(
          `
          <div style="min-width: 220px; font-family: system-ui;">
            <div style="font-weight: bold; font-size: 18px; margin-bottom: 10px; color: #1f2937;">
              ${vehicleId}
            </div>
            <div style="margin-bottom: 6px;">
              <span style="font-weight: 600; color: #374151;">Route:</span> 
              <span style="color: #6b7280;">${unitTracking.route}</span>
            </div>
            <div style="margin-bottom: 6px;">
              <span style="font-weight: 600; color: #374151;">Driver:</span> 
              <span style="color: #6b7280;">${driverName}</span>
            </div>
            <div style="margin-bottom: 6px;">
              <span style="font-weight: 600; color: #374151;">Status:</span> 
              <span style="color: ${statusInfo.textColor.replace("text-", "")}; font-weight: 600;">
                ${statusInfo.text}
              </span>
            </div>
            <div style="font-size: 13px; color: #9ca3af; margin-top: 10px;">
              Updated: ${getTimeAgo(unitTracking.updatedAt)}
            </div>
          </div>
        `
        )
        .addTo(leafletMap.current);

      marker.on("click", () => {
        setSelectedUnit(unitTracking);
      });

      markersRef.current.push(marker);
    });

    // Fit bounds only when no unit is selected
    if (!selectedUnit && filteredUnits.length > 0) {
      const group = new window.L.featureGroup(markersRef.current);
      leafletMap.current.fitBounds(group.getBounds().pad(10));
    }
  }, [
    mergedDataTracking,
    selectedRoute,
    searchTerm,
    getDriverName,
    getStatusInfo,
    getTimeAgo,
    selectedUnit,
  ]);

  // Initialize Leaflet map
  useEffect(() => {
    if (leafletLoaded && mapRef.current && !leafletMap.current && window.L) {
      try {
        leafletMap.current = window.L.map(mapRef.current).setView(
          [13.2905, 121.1267],
          10
        );

        window.L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 15,
          }
        ).addTo(leafletMap.current);

        updateMapMarkers();
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    }
  }, [leafletLoaded, updateMapMarkers]);

  // Update markers when data changes
  useEffect(() => {
    if (leafletMap.current && leafletLoaded) {
      updateMapMarkers();
    }
  }, [updateMapMarkers, leafletLoaded]);

  // Focus on selected unit - zoom in when selected
  useEffect(() => {
    if (selectedUnit && leafletMap.current) {
      leafletMap.current.setView(
        [selectedUnit.latitude, selectedUnit.longitude],
        13,
        { animate: true, duration: 0.5 }
      );
    } else if (!selectedUnit && leafletMap.current && markersRef.current.length > 0) {
      // Zoom out to fit all markers when deselecting
      const group = new window.L.featureGroup(markersRef.current);
      leafletMap.current.fitBounds(group.getBounds().pad(10), { animate: true, duration: 0.5 });
    }
  }, [selectedUnit]);

  // Handle unit selection - toggle selection
  const handleUnitSelection = (unit) => {
    if (selectedUnit && selectedUnit.id === unit.id) {
      setSelectedUnit(null);
    } else {
      setSelectedUnit(unit);
    }
  };

  const filteredUnits = mergedDataTracking
    .filter((ut) => isToday(ut.updatedAt))
    .filter(
      (ut) => selectedRoute === "All Routes" || ut.route === selectedRoute
    )
    .filter(
      (ut) =>
        !searchTerm ||
        ut.unitId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ut.route.toLowerCase().includes(searchTerm.toLowerCase())
    );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 mx-auto mb-4 border-blue-600"></div>
          <p className="text-gray-700 text-lg font-medium">
            Loading tracking data...
          </p>
        </div>
      </div>
    );
  }

  const unitHolderId = selectedUnit?.unitHolder;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white shadow-2xl flex flex-col border-r border-gray-200 max-h-screen">
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-indigo-500">
          <h1 className="text-2xl font-bold text-white mb-4">Unit Tracking</h1>
          <div className="text-blue-100 text-sm mb-4">Today's Active Units</div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search Unit No"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white shadow-sm"
            />
          </div>

          {/* Route Filter */}
          <div>
            <label className="block text-sm font-medium text-blue-100 mb-2">
              Filter by Route:
            </label>
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white shadow-sm"
            >
              {getUniqueRoutes().map((route) => (
                <option key={route} value={route}>
                  {route}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fixed Status Bar */}
        <div className="flex-shrink-0 p-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
          <p className="text-xs text-gray-600 uppercase font-semibold mb-1">
            {filteredUnits.length} Unit{filteredUnits.length !== 1 ? "s" : ""}{" "}
            Available Today
          </p>
          <div className="w-full h-1 bg-blue-200 rounded-full">
            <div
              className="h-1 bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: filteredUnits.length > 0 ? "100%" : "0%" }}
            ></div>
          </div>
        </div>

        {/* Scrollable Units List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400">
          <div className="p-2">
            {filteredUnits.map((unit) => {
              const driverName = unit.unitHolder
                ? getDriverName(unit.unitHolder)
                : "No Driver Found";
              const isSelected = selectedUnit && selectedUnit.id === unit.id;
              const statusInfo = getStatusInfo(unit.status);

              return (
                <div
                  key={unit.id}
                  onClick={() => handleUnitSelection(unit)}
                  className={`m-2 p-4 rounded-xl cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? "bg-gradient-to-r from-blue-100 to-indigo-100 border-2 border-blue-400 shadow-lg"
                      : "bg-white hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 border border-gray-200 hover:border-blue-300 hover:shadow-lg hover:transform hover:scale-[1.01]"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900 text-lg">
                      {unit.vehicleId}
                    </h3>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.bgColor} ${statusInfo.textColor} flex items-center space-x-2 border`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${statusInfo.color} animate-pulse`}
                      ></div>
                      <span>{statusInfo.text}</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-gray-700">
                      <Route className="w-4 h-4 mr-3 text-blue-500" />
                      <span className="truncate font-medium">{unit.route}</span>
                    </div>
                    <div className="flex items-center text-gray-700">
                      <User className="w-4 h-4 mr-3 text-green-500" />
                      <span className="truncate">{driverName}</span>
                    </div>
                    <div className="flex items-center text-gray-500 text-xs">
                      <Clock className="w-4 h-4 mr-3 text-orange-500" />
                      <span>{getTimeAgo(unit.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredUnits.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <div className="bg-gray-100 rounded-full p-6 w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                <MapPin className="w-12 h-12 text-gray-300" />
              </div>
              <p className="font-semibold text-lg mb-2">No units found today</p>
              <p className="text-sm">
                Only units with today's updates will appear here
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content - Map */}
      <div className="flex-1 flex flex-col">
        {/* Map Header */}
        <div className="bg-white shadow-lg p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl">
                <MapPin className="text-blue-600 w-7 h-7" />
              </div>
              <div>
                {selectedUnit ? (
                  <>
                    <h2 className="font-bold text-gray-900 text-xl">
                      {selectedUnit.latitude.toFixed(7)},{" "}
                      {selectedUnit.longitude.toFixed(7)}
                    </h2>
                    <p className="text-gray-600 font-medium">
                      {selectedUnit.vehicleId} - {selectedUnit.route}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-bold text-gray-900 text-xl">
                      Fleet Overview
                    </h2>
                    <p className="text-gray-600 font-medium">
                      Showing all {filteredUnits.length} unit
                      {filteredUnits.length !== 1 ? "s" : ""} updated today
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex space-x-3">
              {selectedUnit && (
                <button
                  onClick={() => setShowDetails(true)}
                  className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Details</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div
            ref={mapRef}
            className="w-full h-full rounded-lg leaflet-container"
            style={{ minHeight: "400px", zIndex: 0 }}
          />
          {!leafletLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 mx-auto mb-4 border-blue-600"></div>
                <p className="text-gray-600">Loading map...</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Info Bar */}
        {filteredUnits.length > 0 && (
          <div className="bg-white border-t border-gray-200 p-6 shadow-lg">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200">
                <div className="text-3xl font-bold text-green-600 mb-1">
                  {
                    filteredUnits.filter(
                      (u) =>
                        u.vehicleStatus.toLowerCase() === "active" ||
                        u.vehicleStatus.toLowerCase() === "moving"
                    ).length
                  }
                </div>
                <div className="text-sm font-semibold text-green-700">
                  Moving
                </div>
                <div className="w-full bg-green-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width:
                        filteredUnits.length > 0
                          ? `${(filteredUnits.filter((u) => u.vehicleStatus.toLowerCase() === "active" || u.vehicleStatus.toLowerCase() === "moving").length / filteredUnits.length) * 100}%`
                          : "0%",
                    }}
                  ></div>
                </div>
              </div>
              <div className="text-center p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                <div className="text-3xl font-bold text-gray-600 mb-1">
                  {
                    filteredUnits.filter(
                      (u) =>
                        u.vehicleStatus.toLowerCase() === "inactive" ||
                        u.vehicleStatus.toLowerCase() === "idle"
                    ).length
                  }
                </div>
                <div className="text-sm font-semibold text-gray-700">Idle</div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-gray-500 h-2 rounded-full transition-all duration-300"
                    style={{
                      width:
                        filteredUnits.length > 0
                          ? `${(filteredUnits.filter((u) => u.vehicleStatus.toLowerCase() === "inactive" || u.vehicleStatus.toLowerCase() === "idle").length / filteredUnits.length) * 100}%`
                          : "0%",
                    }}
                  ></div>
                </div>
              </div>
              <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-indigo-100 rounded-xl border border-blue-200">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {filteredUnits.length}
                </div>
                <div className="text-sm font-semibold text-blue-700">
                  Total Units
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 mt-2">
                  <div className="bg-blue-500 h-2 rounded-full w-full"></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetails && selectedUnit && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white bg-opacity-20 rounded-xl">
                    <Truck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      {selectedUnit.vehicleId}
                    </h2>
                    <p className="text-blue-100">{selectedUnit.route}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="p-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-all duration-200"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Status Card */}
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                  <Navigation className="w-5 h-5 mr-3 text-blue-600" />
                  Current Status
                </h3>
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-6 h-6 rounded-full ${getStatusInfo(selectedUnit.status).color} animate-pulse`}
                  ></div>
                  <span className="font-semibold text-lg">
                    {getStatusInfo(selectedUnit.status).text}
                  </span>
                </div>
              </div>

              {/* Location Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-gray-900 flex items-center">
                    <MapPin className="w-5 h-5 mr-3 text-blue-600" />
                    Location Details
                  </h3>
                  <div className="space-y-3 text-sm bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-gray-600 font-medium">
                        Latitude:
                      </span>
                      <span className="font-semibold">
                        {selectedUnit?.latitude?.toFixed(7) ?? "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 font-medium">
                        Longitude:
                      </span>
                      <span className="font-semibold">
                        {selectedUnit?.longitude?.toFixed(7) ?? "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 font-medium">Unit:</span>
                      <span className="font-semibold">
                        {selectedUnit?.unitName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-gray-900 flex items-center">
                    <User className="w-5 h-5 mr-3 text-blue-600" />
                    Driver Information
                  </h3>
                  <div className="space-y-3 text-sm bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-gray-600 font-medium">Driver:</span>
                      <span className="font-semibold">
                        {unitHolderId
                          ? getDriverName(unitHolderId)
                          : "No Driver Found"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 font-medium">Route:</span>
                      <span className="font-semibold">
                        {selectedUnit.route}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 font-medium">
                        Particular:
                      </span>
                      <span className="font-semibold">
                        {getParticular(unitHolderId)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timestamp Details */}
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                  <Calendar className="w-5 h-5 mr-3 text-blue-600" />
                  Tracking Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 font-medium">
                      Last Updated:
                    </span>
                    <span className="font-semibold">
                      {selectedUnit.updatedAt.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 font-medium">
                      Last Seen:
                    </span>
                    <span className="font-semibold">
                      {getTimeAgo(selectedUnit.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}