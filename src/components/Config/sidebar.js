import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";
import { navLinks } from "../Config/navLinks";
import LogoM from "../../images/logoM.png";
import IconLogout from "../../images/logout.svg";

const auth = getAuth();

// Theme colors
const primaryColor = "#364C6E";
const hoverBg = "#405a88";
const signOutColor = "#ffffff";
const signOutHoverColor = "#d1d5db"; // tailwind gray-300

const Sidebar = ({ user }) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [activeLink, setActiveLink] = useState(location.pathname);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState({}); // Track which parent menus are open

  useEffect(() => {
    setActiveLink(location.pathname);
    
    // Automatically open parent menus when on child routes
    const newOpenMenus = {};
    navLinks.forEach(link => {
      if (link.children) {
        // Check if current path matches any child route
        const isChildActive = link.children.some(child => 
          location.pathname === child.to
        );
        if (isChildActive) {
          newOpenMenus[link.label] = true;
        }
      }
    });
    setOpenMenus(newOpenMenus);
  }, [location]);

  // update CSS variable so the main content can read the sidebar width
  useEffect(() => {
    // tailwind w-64 -> 16rem, w-24 -> 6rem
    const width = collapsed ? "6rem" : "16rem";
    document.documentElement.style.setProperty("--sidebar-width", width);

    // cleanup if component unmounts
    return () => {
      document.documentElement.style.removeProperty("--sidebar-width");
    };
  }, [collapsed]);

  if (!user) return null;

  const { role, permissions = [] } = user;

  // Filter top-level links by role + permissions
  const filteredLinks = navLinks.filter(
    (link) => link.role === role && permissions.includes(link.permission),
  );

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      window.location.href = "/";
    } catch (error) {
      alert("Error signing out: " + error.message);
    }
  };

  const toggleMenu = (label) => {
    setOpenMenus((prev) => {
      // If clicking the already open menu, close it
      if (prev[label]) {
        const { [label]: removed, ...rest } = prev;
        return rest;
      }
      // Otherwise, close all others and open the clicked one
      return { [label]: true };
    });
  };

  return (
    <>
      {/* Fixed Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen text-white flex flex-col transition-all duration-300 z-40 ${
          collapsed ? "w-24" : "w-64"
        }`}
        style={{ backgroundColor: primaryColor }}
      >
        {/* Scrollable middle area: logo + nav */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* logo + collapse button */}
          <div className="flex justify-center py-6">
            <button
              onClick={() => setCollapsed((s) => !s)}
              className="focus:outline-none"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <img
                src={LogoM}
                alt="Logo"
                className={`transition-all duration-300 ${
                  collapsed ? "w-10" : "w-40"
                }`}
                draggable="false"
              />
            </button>
          </div>

          {/* nav */}
          <nav className="w-full px-2 space-y-2 text-sm font-medium mb-6">
            {filteredLinks.map((link) => {
              const isActive = activeLink === link.to;

              if (link.children) {
                // Check if any child is active
                const isChildActive = link.children.some(
                  (child) => activeLink === child.to
                );
                
                return (
                  <div key={link.label}>
                    <button
                      onClick={() => toggleMenu(link.label)}
                      className={`flex items-center w-full px-3 py-2 rounded-lg transition-all duration-300 ease-in-out ${
                        openMenus[link.label] || isChildActive ? "font-bold" : "font-medium"
                      } ${collapsed ? "justify-center" : ""}`}
                      style={{
                        backgroundColor: openMenus[link.label] || isChildActive
                          ? "white"
                          : "transparent",
                        color: openMenus[link.label] || isChildActive ? primaryColor : "white",
                      }}
                    >
                      <img
                        src={
                          openMenus[link.label] || isChildActive
                            ? link.img.active
                            : link.img.inactive
                        }
                        alt={link.label}
                        className="w-5 h-5 flex-shrink-0 object-contain"
                        draggable="false"
                      />
                      {!collapsed && <span className="ml-3">{link.label}</span>}
                    </button>

                    {/* submenu */}
                    {(openMenus[link.label] || isChildActive) && !collapsed && (
                      <div className="ml-6 mt-2 space-y-2 relative">
                        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-white" />
                        {link.children
                          .filter((child) =>
                            permissions.includes(child.permission),
                          )
                          .map((child) => {
                            const childActive = activeLink === child.to;
                            return (
                              <Link
                                key={child.to}
                                to={child.to}
                                onClick={() => setActiveLink(child.to)}
                                className={`flex items-center relative pl-8 pr-3 py-2 rounded-lg transition-all duration-200 ${
                                  childActive
                                    ? "font-bold bg-white"
                                    : "hover:bg-gray-600/50"
                                }`}
                                style={{
                                  color: childActive ? primaryColor : "white"
                                }}
                              >
                                <span className="absolute left-3 top-1/2 w-3 h-0.5 bg-white" />
                                <img
                                  src={
                                    childActive
                                      ? child.img.active
                                      : child.img.inactive
                                  }
                                  alt={child.label}
                                  className="w-4 h-4 flex-shrink-0 object-contain"
                                  draggable="false"
                                />
                                <span className="ml-2">{child.label}</span>
                              </Link>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setActiveLink(link.to)}
                  className={`flex items-center px-3 py-2 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 hover:shadow-md ${
                    isActive ? "font-bold" : "font-medium"
                  } ${collapsed ? "justify-center" : ""}`}
                  style={{
                    backgroundColor: isActive ? "white" : "transparent",
                    color: isActive ? primaryColor : "white",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor = hoverBg;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <img
                    src={isActive ? link.img.active : link.img.inactive}
                    alt={link.label}
                    className="w-5 h-5 flex-shrink-0 object-contain"
                    draggable="false"
                  />
                  {!collapsed && <span className="ml-3">{link.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* fixed bottom sign-out (won't scroll with the nav) */}
        <div className="flex-shrink-0 flex justify-center items-center w-full px-4 py-6">
          {collapsed ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="transition duration-200"
              aria-label="Sign out"
            >
              <img
                src={IconLogout}
                alt="Logout"
                className="w-6 h-6 transition duration-200"
                style={{ filter: "invert(100%)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.filter =
                    "invert(69%) sepia(72%) saturate(443%) hue-rotate(181deg) brightness(92%) contrast(88%)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.filter = "invert(100%)")
                }
                draggable="false"
              />
            </button>
          ) : (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center px-12 py-2 rounded-lg text-gray-800 font-semibold shadow-lg transition duration-200 hover:shadow-xl"
              style={{ backgroundColor: signOutColor, color: primaryColor }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = signOutHoverColor)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = signOutColor)
              }
            >
              Sign Out
            </button>
          )}
        </div>

        {/* Logout modal */}
        {isModalOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
            onClick={() => setIsModalOpen(false)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold text-gray-800 text-center mb-4">
                Confirm Sign Out
              </h2>
              <p className="text-gray-600 text-center mb-6">
                Are you sure you want to sign out?
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-blue-900 transition"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

export default Sidebar;