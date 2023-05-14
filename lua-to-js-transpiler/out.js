import { LuaLib, LuaContext } from './lualib.js';

const $ctx = new LuaContext();

$ctx.declareGlobalFn("declareGlobalPrintHello", function () {
  $ctx.declareGlobalFn("printHello", function () {
    $ctx.callGlobalFn("print", "Hello");
  })
  
})

$ctx.callGlobalFn("declareGlobalPrintHello");
$ctx.callGlobalFn("printHello");
$ctx.assignGlobal({ printHello: "xd" });
$ctx.callGlobalFn("printHello");