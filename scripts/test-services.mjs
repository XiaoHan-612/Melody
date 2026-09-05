// test-services.mjs — 服务层测试：队列数学 / 歌单操作 / 歌词纯函数
import { bootServices, waitFor } from "./test-helpers.mjs";

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("  PASS " + name);
  else { failures++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

const { window, document, test } = await bootServices();
const { setState } = test;

console.log("== 队列服务（reorderQueue 的 qi 修正数学） ==");
setState({ queue: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], qi: 0 });
test.reorderQueue(0, 2); // 播放中的 a 拖到第 3 位 → qi 跟到 2
check("拖动播放中歌曲后 qi 跟随", test.getState().qi === 2, "qi=" + test.getState().qi);
check("顺序调整正确", test.getState().queue.map((s) => s.id).join("") === "bcad");

setState({ queue: [{ id: "a" }, { id: "b" }, { id: "c" }], qi: 2 });
test.reorderQueue(2, 0); // 播放中的 c 拖到首位 → qi=0
check("拖到首位后 qi 归零", test.getState().qi === 0);

setState({ queue: [{ id: "a" }, { id: "b" }, { id: "c" }], qi: 1 });
test.removeFromQueue(0); // 移除播放中之前的 → qi-1
check("移除前方歌曲 qi 减一", test.getState().qi === 0, "qi=" + test.getState().qi);
test.removeFromQueue(1); // 移除后方歌曲（qi=0 指向 b，不受影响）
check("移除后方歌曲后 qi 不变", test.getState().qi === 0, "qi=" + test.getState().qi);

console.log("== 歌单服务（增删改走 setState + 持久化） ==");
setState({ pls: [{ id: "p1", name: "我的歌单", songs: [], created_at: 1, updated_at: 1 }], plId: "p1", pl: [] });
test.addPlNamed("夜跑", { id: "s1", title: "歌", artist: "手", source: "kg" });
await waitFor(() => test.getState().pls.length === 2, 1000, "addPlNamed");
check("新建歌单并加入歌曲", test.getState().pls[1].name === "夜跑" && test.getState().pls[1].songs.length === 1);
check("徽标数据同步（pls 引用变更）", test.getState().pls.length === 2);

setState({ pls: [{ id: "p1", name: "A", songs: [{ id: "1" }, { id: "2" }, { id: "3" }] }], plId: "p1", pl: test.getState().pls[0].songs });
test.reorderPl(0, 2);
check("歌单拖拽排序", test.getState().pls[0].songs.map((s) => s.id).join("") === "231");
test.rmFromPl(1);
check("歌单移除歌曲", test.getState().pls[0].songs.length === 2);

console.log("== 歌词纯函数 ==");
const lines = test.parseLrc("[01:00.10]第一句\n[02:00.5]第二句\n[00:30]忽略无文本\n[00:15.20]最早");
check("parseLrc 排序（含无毫秒格式）", lines.length === 4 && lines[0].time === 15.2 && lines[1].time === 30 && lines[3].time === 120.5, JSON.stringify(lines));
const qrc = test.parseQrc("[00:10.00]你[00:10.50]好[00:11.00]世[00:11.50]界[00:12.00]再[00:12.50]见[00:13.00]啊[00:13.50]哈");
check("parseQrc 提取逐字时间戳", qrc && qrc.length === 8, qrc && String(qrc.length));
check("parseQrc 短序列拒绝（回退均分）", test.parseQrc("[00:01.00]a[00:02.00]b") === null);
check("normalizeILMode 迁移 star→galaxy", test.normalizeILMode("star") === "galaxy");
check("normalizeILMode 非法值回退 spec", test.normalizeILMode("bogus") === "spec");

console.log("");
if (failures === 0) console.log("=== SERVICE TESTS PASSED ===");
else console.log("=== " + failures + " SERVICE TEST(S) FAILED ===");
process.exit(failures === 0 ? 0 : 1);
