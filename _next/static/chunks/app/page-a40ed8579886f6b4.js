(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[931],{3172:function(e,s,l){Promise.resolve().then(l.bind(l,2776))},2776:function(e,s,l){"use strict";l.r(s),l.d(s,{default:function(){return n}});var t=l(7437),a=l(2265);function r(e){let{className:s="",progress:l,...a}=e;return(0,t.jsxs)("div",{className:"relative inline-flex items-center justify-center ".concat(s),...a,children:[(0,t.jsx)("div",{className:"animate-spin h-8 w-8 border-4 border-blue-600 rounded-full border-t-transparent"}),void 0!==l&&(0,t.jsxs)("div",{className:"absolute text-sm font-bold text-blue-600",children:[Math.round(l),"%"]})]})}function n(){let[e,s]=a.useState(null),[l,n]=a.useState(""),[d,i]=a.useState(!1),[o,c]=a.useState(0),[m,x]=a.useState(""),[u,h]=a.useState(null);return(0,t.jsx)("div",{className:"min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 p-8",children:(0,t.jsxs)("div",{className:"max-w-2xl mx-auto space-y-8",children:[(0,t.jsxs)("div",{className:"text-center space-y-2 animate-fade-in",children:[(0,t.jsx)("h1",{className:"text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600",children:"Resume Match Analyzer"}),(0,t.jsx)("p",{className:"text-gray-600",children:"Get instant feedback on how well your resume matches job requirements"})]},"header"),(0,t.jsxs)("form",{onSubmit:function(s){if(s.preventDefault(),!e||!l.trim())return;i(!0),x(""),h(null);let t=new FormData;t.append("resume",e),t.append("jobDescription",new Blob([l]));let a=new XMLHttpRequest;a.responseType="json",a.upload.addEventListener("progress",e=>{e.lengthComputable&&c(Math.round(e.loaded/e.total*100))}),a.addEventListener("load",()=>{if(a.status>=200&&a.status<300){let e=a.response;if(!e.recommendations||!e.matchedSkills)throw Error("Invalid analysis result");h(e)}else{var e;throw Error((null===(e=a.response)||void 0===e?void 0:e.error)||"Analysis failed")}}),a.addEventListener("error",()=>{x("Network error occurred")}),a.addEventListener("loadend",()=>{i(!1),c(0)}),a.open("POST","/api/analyze"),a.send(t)},className:"space-y-6 bg-white p-8 rounded-xl shadow-md transition-all hover:shadow-lg",children:[(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("label",{className:"block text-sm font-medium text-gray-700",children:"Upload Resume"}),(0,t.jsx)("input",{type:"file",className:"block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100",accept:".pdf,.doc,.docx",onChange:e=>{var l;return(null===(l=e.target.files)||void 0===l?void 0:l[0])&&s(e.target.files[0])},disabled:d},"file")]},"file-container"),(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("label",{className:"block text-sm font-medium text-gray-700",children:"Job Description"}),(0,t.jsx)("textarea",{className:"w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",rows:6,placeholder:"Paste the job description here...",value:l,onChange:e=>n(e.target.value),disabled:d},"text")]},"textarea-container"),(0,t.jsxs)("button",{type:"submit",disabled:d||!e||!l.trim(),className:"w-full p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-2",children:[d&&(0,t.jsx)(r,{progress:o},"spinner"),(0,t.jsx)("span",{children:d?"Analyzing...":"Analyze Resume"},"label")]},"submit")]},"form"),m&&(0,t.jsx)("div",{className:"mt-4 p-4 bg-red-50 text-red-700 rounded",children:m},"error"),u&&(0,t.jsxs)("div",{className:"mt-6 bg-white p-8 rounded-xl shadow-lg space-y-8 animate-fade-in",children:[(0,t.jsxs)("div",{className:"text-center",children:[(0,t.jsx)("h2",{className:"text-xl font-semibold text-gray-700 mb-2",children:"Match Score"}),(0,t.jsxs)("div",{className:"text-5xl font-bold ".concat(u.score>=70?"text-green-500":u.score>=50?"text-yellow-500":"text-red-500"),children:[u.score,"%"]}),(0,t.jsx)("div",{className:"w-full bg-gray-200 rounded-full h-2.5 mt-4",children:(0,t.jsx)("div",{className:"".concat(u.score>=70?"bg-green-500":u.score>=50?"bg-yellow-500":"bg-red-500"," h-2.5 rounded-full"),style:{width:"".concat(u.score,"%")}})})]},"score"),(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:"text-lg font-semibold mb-3 text-gray-800",children:"Matched Skills"}),(0,t.jsx)("div",{className:"flex flex-wrap gap-2",children:u.matchedSkills.filter(e=>e.match).map((e,s)=>(0,t.jsxs)("span",{className:"bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded-full flex items-center",children:[(0,t.jsx)("svg",{className:"w-3 h-3 mr-1.5 text-green-500",fill:"currentColor",viewBox:"0 0 20 20",children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z",clipRule:"evenodd"})}),e.name]},s))})]},"matched"),(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:"text-lg font-semibold mb-3 text-gray-800",children:"Skills to Improve"}),(0,t.jsx)("div",{className:"flex flex-wrap gap-2",children:u.missingSkills.map((e,s)=>(0,t.jsxs)("span",{className:"bg-red-100 text-red-800 text-sm font-medium px-2.5 py-0.5 rounded-full flex items-center",children:[(0,t.jsx)("svg",{className:"w-3 h-3 mr-1.5 text-red-500",fill:"currentColor",viewBox:"0 0 20 20",children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z",clipRule:"evenodd"})}),e]},s))})]},"missing"),(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:"text-lg font-semibold mb-3 text-gray-800",children:"Recommended Improvements"}),(0,t.jsx)("div",{className:"space-y-3",children:u.recommendations.improvements.map((e,s)=>(0,t.jsx)("div",{className:"p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r",children:(0,t.jsxs)("div",{className:"flex items-start",children:[(0,t.jsx)("svg",{className:"w-5 h-5 text-yellow-500 mr-2 mt-0.5 flex-shrink-0",fill:"currentColor",viewBox:"0 0 20 20",children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z",clipRule:"evenodd"})}),(0,t.jsx)("span",{className:"text-gray-700",children:e})]})},s))})]},"improvements"),(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:"text-lg font-semibold mb-3 text-gray-800",children:"Format Suggestions"}),(0,t.jsx)("div",{className:"space-y-3",children:u.recommendations.format.map((e,s)=>(0,t.jsx)("div",{className:"p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r",children:(0,t.jsxs)("div",{className:"flex items-start",children:[(0,t.jsx)("svg",{className:"w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0",fill:"currentColor",viewBox:"0 0 20 20",children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z",clipRule:"evenodd"})}),(0,t.jsx)("span",{className:"text-gray-700",children:e})]})},s))})]},"format"),(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:"text-lg font-semibold mb-3 text-gray-800",children:"Detailed Analysis"}),(0,t.jsx)("div",{className:"p-4 bg-gray-50 rounded-lg border border-gray-200",children:(0,t.jsx)("p",{className:"text-gray-700 whitespace-pre-wrap",children:u.detailedAnalysis})})]},"analysis")]},"result")]})})}}},function(e){e.O(0,[971,69,744],function(){return e(e.s=3172)}),_N_E=e.O()}]);