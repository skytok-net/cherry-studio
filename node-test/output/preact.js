
(function() {
  try {
    const existingKeys = Array.isArray(window.__tsxAssignedKeys) ? window.__tsxAssignedKeys : [];
    existingKeys.forEach(function(key) {
      try { delete window[key]; } catch (err) {}
    });
    window.__tsxAssignedKeys = [];
    window.__tsxComponent = null;
    window.__tsxLastModule = null;
  } catch (err) {}

  const require = function(moduleName) {
    if (typeof moduleName === 'string' && moduleName.endsWith('.css')) {
      return {};
    }

    const moduleMap = {
      'react': window.React,
      'react-dom': window.ReactDOM,
      '@xyflow/react': window.ReactFlow,
      'reactflow': window.ReactFlow,
      'lucide-react': window.LucideReact,
      'clsx': window.clsx
    };

    if (moduleMap[moduleName]) {
      return moduleMap[moduleName];
    }

    throw new Error('Module not found: ' + moduleName);
  };

  const exports = {};
  const module = { exports };

  var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var Component_exports = {};
__export(Component_exports, {
  default: () => PreactCounter
});
module.exports = __toCommonJS(Component_exports);
function PreactCounter() {
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const increment = () => setCount(count + 1);
  const decrement = () => setCount(count - 1);
  const toggle = () => setIsOpen(!isOpen);
  return /* @__PURE__ */ React.createElement("div", { className: "p-8 space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: `p-6 rounded-lg shadow-lg ${isOpen ? "bg-purple-100" : "bg-white"}` }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-4" }, /* @__PURE__ */ React.createElement("h1", { className: "text-2xl font-bold" }, "Preact Counter"), /* @__PURE__ */ React.createElement("button", { onClick: toggle, className: "p-2" }, isOpen ? "\u2715" : "\u25BC")), /* @__PURE__ */ React.createElement("div", { className: "text-4xl font-bold text-center my-6" }, count), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 justify-center" }, /* @__PURE__ */ React.createElement("button", { onClick: decrement, className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600" }, "Decrement"), /* @__PURE__ */ React.createElement("button", { onClick: increment, className: "px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600" }, "Increment"))), isOpen && /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-gray-100 rounded-lg" }, /* @__PURE__ */ React.createElement("p", { className: "text-gray-700" }, "Additional content shown when open")));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQ29tcG9uZW50LnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBQcmVhY3RDb3VudGVyKCkge1xuICBjb25zdCBbY291bnQsIHNldENvdW50XSA9IHVzZVN0YXRlKDApXG4gIGNvbnN0IFtpc09wZW4sIHNldElzT3Blbl0gPSB1c2VTdGF0ZShmYWxzZSlcblxuICBjb25zdCBpbmNyZW1lbnQgPSAoKSA9PiBzZXRDb3VudChjb3VudCArIDEpXG4gIGNvbnN0IGRlY3JlbWVudCA9ICgpID0+IHNldENvdW50KGNvdW50IC0gMSlcbiAgY29uc3QgdG9nZ2xlID0gKCkgPT4gc2V0SXNPcGVuKCFpc09wZW4pXG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cInAtOCBzcGFjZS15LTRcIj5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPXtgcC02IHJvdW5kZWQtbGcgc2hhZG93LWxnICR7aXNPcGVuID8gJ2JnLXB1cnBsZS0xMDAnIDogJ2JnLXdoaXRlJ31gfT5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWJldHdlZW4gbWItNFwiPlxuICAgICAgICAgIDxoMSBjbGFzc05hbWU9XCJ0ZXh0LTJ4bCBmb250LWJvbGRcIj5QcmVhY3QgQ291bnRlcjwvaDE+XG4gICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXt0b2dnbGV9IGNsYXNzTmFtZT1cInAtMlwiPlxuICAgICAgICAgICAge2lzT3BlbiA/ICdcdTI3MTUnIDogJ1x1MjVCQyd9XG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwidGV4dC00eGwgZm9udC1ib2xkIHRleHQtY2VudGVyIG15LTZcIj57Y291bnR9PC9kaXY+XG5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGdhcC0yIGp1c3RpZnktY2VudGVyXCI+XG4gICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtkZWNyZW1lbnR9IGNsYXNzTmFtZT1cInB4LTQgcHktMiBiZy1yZWQtNTAwIHRleHQtd2hpdGUgcm91bmRlZCBob3ZlcjpiZy1yZWQtNjAwXCI+XG4gICAgICAgICAgICBEZWNyZW1lbnRcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e2luY3JlbWVudH0gY2xhc3NOYW1lPVwicHgtNCBweS0yIGJnLXB1cnBsZS01MDAgdGV4dC13aGl0ZSByb3VuZGVkIGhvdmVyOmJnLXB1cnBsZS02MDBcIj5cbiAgICAgICAgICAgIEluY3JlbWVudFxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuXG4gICAgICB7aXNPcGVuICYmIChcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJwLTQgYmctZ3JheS0xMDAgcm91bmRlZC1sZ1wiPlxuICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInRleHQtZ3JheS03MDBcIj5BZGRpdGlvbmFsIGNvbnRlbnQgc2hvd24gd2hlbiBvcGVuPC9wPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICl9XG4gICAgPC9kaXY+XG4gIClcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNlLFNBQVIsZ0JBQWlDO0FBQ3RDLFFBQU0sQ0FBQyxPQUFPLFFBQVEsSUFBSSxTQUFTLENBQUM7QUFDcEMsUUFBTSxDQUFDLFFBQVEsU0FBUyxJQUFJLFNBQVMsS0FBSztBQUUxQyxRQUFNLFlBQVksTUFBTSxTQUFTLFFBQVEsQ0FBQztBQUMxQyxRQUFNLFlBQVksTUFBTSxTQUFTLFFBQVEsQ0FBQztBQUMxQyxRQUFNLFNBQVMsTUFBTSxVQUFVLENBQUMsTUFBTTtBQUV0QyxTQUNFLG9DQUFDLFNBQUksV0FBVSxtQkFDYixvQ0FBQyxTQUFJLFdBQVcsNEJBQTRCLFNBQVMsa0JBQWtCLFVBQVUsTUFDL0Usb0NBQUMsU0FBSSxXQUFVLDRDQUNiLG9DQUFDLFFBQUcsV0FBVSx3QkFBcUIsZ0JBQWMsR0FDakQsb0NBQUMsWUFBTyxTQUFTLFFBQVEsV0FBVSxTQUNoQyxTQUFTLFdBQU0sUUFDbEIsQ0FDRixHQUVBLG9DQUFDLFNBQUksV0FBVSx5Q0FBdUMsS0FBTSxHQUU1RCxvQ0FBQyxTQUFJLFdBQVUsK0JBQ2Isb0NBQUMsWUFBTyxTQUFTLFdBQVcsV0FBVSw4REFBMkQsV0FFakcsR0FDQSxvQ0FBQyxZQUFPLFNBQVMsV0FBVyxXQUFVLG9FQUFpRSxXQUV2RyxDQUNGLENBQ0YsR0FFQyxVQUNDLG9DQUFDLFNBQUksV0FBVSxnQ0FDYixvQ0FBQyxPQUFFLFdBQVUsbUJBQWdCLG9DQUFrQyxDQUNqRSxDQUVKO0FBRUo7IiwKICAibmFtZXMiOiBbXQp9Cg==


  const resolved = module.exports || exports;
  if (resolved && typeof resolved === 'object') {
    Object.keys(resolved).forEach(function(key) {
      try {
        window[key] = resolved[key];
        window.__tsxAssignedKeys.push(key);
      } catch (err) {}
    });
    if (resolved.default) {
      window.App = resolved.default;
      window.__tsxComponent = resolved.default;
      window.__tsxLastModule = resolved;
    }
  }
  if (!window.__tsxComponent && typeof resolved === 'function') {
    window.__tsxComponent = resolved;
  }
})();
