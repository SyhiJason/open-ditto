import type { Candidate } from "./types";

export interface TimeSlot {
  day: string;
  date: string;
  start: string;
  end: string;
  label: string;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  type: string;
  vibe: string;
  tags: string[];
}

export const DEFAULT_CANDIDATES: Candidate[] = [
  {
    id: "match1",
    name: "Aria",
    trust_score: 0.88,
    schedule_score: 0.74,
    risk_tags: [],
    profile: {
      name: "Aria",
      age: 27,
      city: "上海",
      interests: ["徒步", "摄影", "咖啡", "文学"],
      partnerPrefs: "开朗、有好奇心、喜欢户外活动",
      dealbreakers: "不喜欢吸烟者",
      selfDescription: "热爱生活的摄影师，周末喜欢探索城市角落",
    },
  },
  {
    id: "match2",
    name: "Lucas",
    trust_score: 0.82,
    schedule_score: 0.69,
    risk_tags: ["late_reply"],
    profile: {
      name: "Lucas",
      age: 29,
      city: "北京",
      interests: ["爵士乐", "烹饪", "电影", "骑行"],
      partnerPrefs: "独立、有品味、喜欢安静的约会场所",
      dealbreakers: "不喜欢过于依赖的人",
      selfDescription: "音乐人兼厨师，最快乐的时光是为喜欢的人做饭",
    },
  },
  {
    id: "match3",
    name: "Mei",
    trust_score: 0.79,
    schedule_score: 0.81,
    risk_tags: [],
    profile: {
      name: "Mei",
      age: 25,
      city: "深圳",
      interests: ["瑜伽", "旅行", "设计", "冥想"],
      partnerPrefs: "温柔、有耐心、对未来有规划",
      dealbreakers: "不喜欢不守时的人",
      selfDescription: "UX 设计师，相信美好的体验改变生活",
    },
  },
  {
    id: "match4",
    name: "Nora",
    trust_score: 0.92,
    schedule_score: 0.76,
    risk_tags: [],
    profile: {
      name: "Nora",
      age: 28,
      city: "上海",
      interests: ["书店", "咖啡", "展览", "跑步"],
      partnerPrefs: "沟通直接、情绪稳定、愿意长期投入",
      dealbreakers: "冷暴力和失联",
      selfDescription: "品牌策略顾问，喜欢带着相机逛展",
    },
  },
  {
    id: "match5",
    name: "Evan",
    trust_score: 0.66,
    schedule_score: 0.58,
    risk_tags: ["low_profile_consistency"],
    profile: {
      name: "Evan",
      age: 33,
      city: "上海",
      interests: ["投资", "夜店", "冲浪"],
      partnerPrefs: "随性，别管太多",
      dealbreakers: "不接受日常报备",
      selfDescription: "创业中，生活节奏不固定",
    },
  },
];

export const VENUE_POOL: Venue[] = [
  {
    id: "venue-1",
    name: "Blue Bottle Coffee",
    city: "上海",
    type: "咖啡馆",
    vibe: "安静",
    tags: ["咖啡", "聊天", "书店"],
  },
  {
    id: "venue-2",
    name: "M50 创意园",
    city: "上海",
    type: "艺术园区",
    vibe: "开放",
    tags: ["摄影", "展览", "漫步"],
  },
  {
    id: "venue-3",
    name: "西岸滨江步道",
    city: "上海",
    type: "户外",
    vibe: "轻松",
    tags: ["徒步", "跑步", "日落"],
  },
  {
    id: "venue-4",
    name: "京都爵士吧",
    city: "北京",
    type: "酒吧",
    vibe: "夜晚",
    tags: ["音乐", "爵士", "聊天"],
  },
  {
    id: "venue-5",
    name: "南山书城",
    city: "深圳",
    type: "书店",
    vibe: "安静",
    tags: ["阅读", "咖啡", "设计"],
  },
];

export function getMockCalendarSlots(): TimeSlot[] {
  const now = new Date();
  const makeDate = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  };

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  const dayName = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "long" });

  const d1 = makeDate(1);
  const d2 = makeDate(3);
  const d3 = makeDate(5);

  return [
    {
      day: dayName(d1),
      date: fmtDate(d1),
      start: "19:00",
      end: "21:00",
      label: "Weekday evening",
    },
    {
      day: dayName(d2),
      date: fmtDate(d2),
      start: "14:00",
      end: "17:00",
      label: "Afternoon",
    },
    {
      day: dayName(d3),
      date: fmtDate(d3),
      start: "10:00",
      end: "13:00",
      label: "Weekend morning",
    },
  ];
}
