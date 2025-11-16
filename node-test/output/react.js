
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
  default: () => ReactCounter
});
module.exports = __toCommonJS(Component_exports);
const Background = window.ReactFlow.Background;
const Controls = window.ReactFlow.Controls;
const ReactFlow = window.ReactFlow.ReactFlow;
const useEdgesState = window.ReactFlow.useEdgesState;
const useNodesState = window.ReactFlow.useNodesState;
const clsx = window.clsx;
const ChevronDown = window.LucideReact.ChevronDown;
const Menu = window.LucideReact.Menu;
const X = window.LucideReact.X;
const React = window.React;
const useState = window.React.useState;
function ReactCounter() {
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: "1", position: { x: 0, y: 0 }, data: { label: "Node 1" } },
    { id: "2", position: { x: 100, y: 100 }, data: { label: "Node 2" } }
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([{ id: "e1-2", source: "1", target: "2" }]);
  return /* @__PURE__ */ React.createElement("div", { className: "p-8 space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: clsx("p-6 rounded-lg shadow-lg", isOpen ? "bg-blue-100" : "bg-white") }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-4" }, /* @__PURE__ */ React.createElement("h1", { className: "text-2xl font-bold flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Menu, { size: 24 }), "React Counter"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsOpen(!isOpen) }, isOpen ? /* @__PURE__ */ React.createElement(X, { size: 20 }) : /* @__PURE__ */ React.createElement(ChevronDown, { size: 20 }))), /* @__PURE__ */ React.createElement("div", { className: "text-4xl font-bold text-center my-6" }, count), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 justify-center" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setCount(count - 1),
      className: "px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
    },
    "Decrement"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setCount(count + 1),
      className: "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    },
    "Increment"
  ))), /* @__PURE__ */ React.createElement("div", { className: "h-64 bg-gray-50 rounded-lg border-2 border-gray-200" }, /* @__PURE__ */ React.createElement(ReactFlow, { nodes, edges, onNodesChange, onEdgesChange }, /* @__PURE__ */ React.createElement(Controls, null), /* @__PURE__ */ React.createElement(Background, null))));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQ29tcG9uZW50LnRzeCJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgQmFja2dyb3VuZCA9IHdpbmRvdy5SZWFjdEZsb3cuQmFja2dyb3VuZDtcbmNvbnN0IENvbnRyb2xzID0gd2luZG93LlJlYWN0Rmxvdy5Db250cm9scztcbmNvbnN0IFJlYWN0RmxvdyA9IHdpbmRvdy5SZWFjdEZsb3cuUmVhY3RGbG93O1xuY29uc3QgdXNlRWRnZXNTdGF0ZSA9IHdpbmRvdy5SZWFjdEZsb3cudXNlRWRnZXNTdGF0ZTtcbmNvbnN0IHVzZU5vZGVzU3RhdGUgPSB3aW5kb3cuUmVhY3RGbG93LnVzZU5vZGVzU3RhdGU7XG5jb25zdCBjbHN4ID0gd2luZG93LmNsc3g7XG5jb25zdCBDaGV2cm9uRG93biA9IHdpbmRvdy5MdWNpZGVSZWFjdC5DaGV2cm9uRG93bjtcbmNvbnN0IE1lbnUgPSB3aW5kb3cuTHVjaWRlUmVhY3QuTWVudTtcbmNvbnN0IFggPSB3aW5kb3cuTHVjaWRlUmVhY3QuWDtcbmNvbnN0IFJlYWN0ID0gd2luZG93LlJlYWN0O1xuY29uc3QgdXNlU3RhdGUgPSB3aW5kb3cuUmVhY3QudXNlU3RhdGU7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFJlYWN0Q291bnRlcigpIHtcbiAgY29uc3QgW2NvdW50LCBzZXRDb3VudF0gPSB1c2VTdGF0ZSgwKVxuICBjb25zdCBbaXNPcGVuLCBzZXRJc09wZW5dID0gdXNlU3RhdGUoZmFsc2UpXG5cbiAgY29uc3QgW25vZGVzLCBzZXROb2Rlcywgb25Ob2Rlc0NoYW5nZV0gPSB1c2VOb2Rlc1N0YXRlKFtcbiAgICB7IGlkOiAnMScsIHBvc2l0aW9uOiB7IHg6IDAsIHk6IDAgfSwgZGF0YTogeyBsYWJlbDogJ05vZGUgMScgfSB9LFxuICAgIHsgaWQ6ICcyJywgcG9zaXRpb246IHsgeDogMTAwLCB5OiAxMDAgfSwgZGF0YTogeyBsYWJlbDogJ05vZGUgMicgfSB9XG4gIF0pXG5cbiAgY29uc3QgW2VkZ2VzLCBzZXRFZGdlcywgb25FZGdlc0NoYW5nZV0gPSB1c2VFZGdlc1N0YXRlKFt7IGlkOiAnZTEtMicsIHNvdXJjZTogJzEnLCB0YXJnZXQ6ICcyJyB9XSlcblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwicC04IHNwYWNlLXktNFwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9e2Nsc3goJ3AtNiByb3VuZGVkLWxnIHNoYWRvdy1sZycsIGlzT3BlbiA/ICdiZy1ibHVlLTEwMCcgOiAnYmctd2hpdGUnKX0+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIganVzdGlmeS1iZXR3ZWVuIG1iLTRcIj5cbiAgICAgICAgICA8aDEgY2xhc3NOYW1lPVwidGV4dC0yeGwgZm9udC1ib2xkIGZsZXggaXRlbXMtY2VudGVyIGdhcC0yXCI+XG4gICAgICAgICAgICA8TWVudSBzaXplPXsyNH0gLz5cbiAgICAgICAgICAgIFJlYWN0IENvdW50ZXJcbiAgICAgICAgICA8L2gxPlxuICAgICAgICAgIDxidXR0b24gb25DbGljaz17KCkgPT4gc2V0SXNPcGVuKCFpc09wZW4pfT57aXNPcGVuID8gPFggc2l6ZT17MjB9IC8+IDogPENoZXZyb25Eb3duIHNpemU9ezIwfSAvPn08L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0ZXh0LTR4bCBmb250LWJvbGQgdGV4dC1jZW50ZXIgbXktNlwiPntjb3VudH08L2Rpdj5cblxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZ2FwLTIganVzdGlmeS1jZW50ZXJcIj5cbiAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBzZXRDb3VudChjb3VudCAtIDEpfVxuICAgICAgICAgICAgY2xhc3NOYW1lPVwicHgtNCBweS0yIGJnLXJlZC01MDAgdGV4dC13aGl0ZSByb3VuZGVkIGhvdmVyOmJnLXJlZC02MDBcIj5cbiAgICAgICAgICAgIERlY3JlbWVudFxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHNldENvdW50KGNvdW50ICsgMSl9XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJweC00IHB5LTIgYmctYmx1ZS01MDAgdGV4dC13aGl0ZSByb3VuZGVkIGhvdmVyOmJnLWJsdWUtNjAwXCI+XG4gICAgICAgICAgICBJbmNyZW1lbnRcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cblxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJoLTY0IGJnLWdyYXktNTAgcm91bmRlZC1sZyBib3JkZXItMiBib3JkZXItZ3JheS0yMDBcIj5cbiAgICAgICAgPFJlYWN0RmxvdyBub2Rlcz17bm9kZXN9IGVkZ2VzPXtlZGdlc30gb25Ob2Rlc0NoYW5nZT17b25Ob2Rlc0NoYW5nZX0gb25FZGdlc0NoYW5nZT17b25FZGdlc0NoYW5nZX0+XG4gICAgICAgICAgPENvbnRyb2xzIC8+XG4gICAgICAgICAgPEJhY2tncm91bmQgLz5cbiAgICAgICAgPC9SZWFjdEZsb3c+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgKVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFBTSxhQUFhLE9BQU8sVUFBVTtBQUNwQyxNQUFNLFdBQVcsT0FBTyxVQUFVO0FBQ2xDLE1BQU0sWUFBWSxPQUFPLFVBQVU7QUFDbkMsTUFBTSxnQkFBZ0IsT0FBTyxVQUFVO0FBQ3ZDLE1BQU0sZ0JBQWdCLE9BQU8sVUFBVTtBQUN2QyxNQUFNLE9BQU8sT0FBTztBQUNwQixNQUFNLGNBQWMsT0FBTyxZQUFZO0FBQ3ZDLE1BQU0sT0FBTyxPQUFPLFlBQVk7QUFDaEMsTUFBTSxJQUFJLE9BQU8sWUFBWTtBQUM3QixNQUFNLFFBQVEsT0FBTztBQUNyQixNQUFNLFdBQVcsT0FBTyxNQUFNO0FBRWYsU0FBUixlQUFnQztBQUNyQyxRQUFNLENBQUMsT0FBTyxRQUFRLElBQUksU0FBUyxDQUFDO0FBQ3BDLFFBQU0sQ0FBQyxRQUFRLFNBQVMsSUFBSSxTQUFTLEtBQUs7QUFFMUMsUUFBTSxDQUFDLE9BQU8sVUFBVSxhQUFhLElBQUksY0FBYztBQUFBLElBQ3JELEVBQUUsSUFBSSxLQUFLLFVBQVUsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsTUFBTSxFQUFFLE9BQU8sU0FBUyxFQUFFO0FBQUEsSUFDL0QsRUFBRSxJQUFJLEtBQUssVUFBVSxFQUFFLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxNQUFNLEVBQUUsT0FBTyxTQUFTLEVBQUU7QUFBQSxFQUNyRSxDQUFDO0FBRUQsUUFBTSxDQUFDLE9BQU8sVUFBVSxhQUFhLElBQUksY0FBYyxDQUFDLEVBQUUsSUFBSSxRQUFRLFFBQVEsS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDO0FBRWpHLFNBQ0Usb0NBQUMsU0FBSSxXQUFVLG1CQUNiLG9DQUFDLFNBQUksV0FBVyxLQUFLLDRCQUE0QixTQUFTLGdCQUFnQixVQUFVLEtBQ2xGLG9DQUFDLFNBQUksV0FBVSw0Q0FDYixvQ0FBQyxRQUFHLFdBQVUsZ0RBQ1osb0NBQUMsUUFBSyxNQUFNLElBQUksR0FBRSxlQUVwQixHQUNBLG9DQUFDLFlBQU8sU0FBUyxNQUFNLFVBQVUsQ0FBQyxNQUFNLEtBQUksU0FBUyxvQ0FBQyxLQUFFLE1BQU0sSUFBSSxJQUFLLG9DQUFDLGVBQVksTUFBTSxJQUFJLENBQUcsQ0FDbkcsR0FFQSxvQ0FBQyxTQUFJLFdBQVUseUNBQXVDLEtBQU0sR0FFNUQsb0NBQUMsU0FBSSxXQUFVLCtCQUNiO0FBQUEsSUFBQztBQUFBO0FBQUEsTUFDQyxTQUFTLE1BQU0sU0FBUyxRQUFRLENBQUM7QUFBQSxNQUNqQyxXQUFVO0FBQUE7QUFBQSxJQUEyRDtBQUFBLEVBRXZFLEdBQ0E7QUFBQSxJQUFDO0FBQUE7QUFBQSxNQUNDLFNBQVMsTUFBTSxTQUFTLFFBQVEsQ0FBQztBQUFBLE1BQ2pDLFdBQVU7QUFBQTtBQUFBLElBQTZEO0FBQUEsRUFFekUsQ0FDRixDQUNGLEdBRUEsb0NBQUMsU0FBSSxXQUFVLHlEQUNiLG9DQUFDLGFBQVUsT0FBYyxPQUFjLGVBQThCLGlCQUNuRSxvQ0FBQyxjQUFTLEdBQ1Ysb0NBQUMsZ0JBQVcsQ0FDZCxDQUNGLENBQ0Y7QUFFSjsiLAogICJuYW1lcyI6IFtdCn0K


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
