export var EventStatus;
(function (EventStatus) {
    EventStatus["PENDING"] = "PENDING";
    EventStatus["IN_PROGRESS"] = "IN_PROGRESS";
    EventStatus["COMPLETED"] = "COMPLETED";
    EventStatus["FAILED"] = "FAILED";
})(EventStatus || (EventStatus = {}));
// ['a', 'b', { or: [['e', 'f'], ['g', 'h']] }, { or: [['i', 'j'], ['k', { or: [['l'], ['m']] }]] }]
// would decompose into
// [
//   ['a', 'b', 'e', 'f', 'i', 'j'],
//   ['a', 'b', 'e', 'f', 'k', 'l'],
//   ['a', 'b', 'g', 'h', 'i', 'j'],
//   ['a', 'b', 'g', 'h', 'k', 'l'],
// ]
//# sourceMappingURL=types.js.map