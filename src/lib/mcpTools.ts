/**
 * mcpTools.ts
 *
 * MCP (Model Context Protocol) Tool Stubs for Open Ditto demo.
 *
 * In a production system these would be real MCP servers that:
 *  - `getFreeTime`     → reads Google Calendar / iCal
 *  - `verifyProfile`   → checks LinkedIn / Instagram authenticity
 *
 * For the demo we return realistic mock data that the agent engine
 * can reason over exactly as if they were real tool responses.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TimeSlot {
    day: string;
    date: string;
    start: string;
    end: string;
    label: string; // human-readable
}

export interface ProfileVerification {
    platform: string;
    url: string;
    verified: boolean;
    confidence: number; // 0–1
    signals: string[];  // Evidence for/against authenticity
}

// ─── Tool: getFreeTime ───────────────────────────────────────────────────────

/**
 * MCP Tool: Returns the user's available time slots for the next 7 days.
 * In production: would call calendar API via MCP server.
 */
export function getFreeTime(): TimeSlot[] {
    const now = new Date();
    const slots: TimeSlot[] = [];

    // Generate realistic-looking free slots for the next week
    const schedule = [
        { dayOffset: 1, start: "19:00", end: "22:00", label: "Weekday evening" },
        { dayOffset: 3, start: "14:00", end: "17:00", label: "Afternoon window" },
        { dayOffset: 5, start: "10:00", end: "18:00", label: "Saturday free" },
        { dayOffset: 6, start: "11:00", end: "15:00", label: "Sunday morning" },
    ];

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    for (const item of schedule) {
        const d = new Date(now);
        d.setDate(d.getDate() + item.dayOffset);
        slots.push({
            day: dayNames[d.getDay()],
            date: d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" }),
            start: item.start,
            end: item.end,
            label: item.label,
        });
    }

    return slots;
}

// ─── Tool: verifyProfile ─────────────────────────────────────────────────────

/**
 * MCP Tool: Checks if a social profile URL appears authentic.
 * In production: would scrape + run authenticity heuristics via MCP server.
 */
export async function verifyProfile(
    platform: "linkedin" | "instagram" | "weibo" | "wechat",
    username: string
): Promise<ProfileVerification> {
    // Simulate async network call
    await new Promise((r) => setTimeout(r, 800));

    // Mock verification signals (in production these come from the MCP server)
    const mockResults: Record<string, ProfileVerification> = {
        linkedin: {
            platform: "LinkedIn",
            url: `https://linkedin.com/in/${username}`,
            verified: true,
            confidence: 0.91,
            signals: [
                "Account created > 2 years ago",
                "500+ connections",
                "Employment history consistent",
                "Profile photo appears authentic (not AI-generated)",
            ],
        },
        instagram: {
            platform: "Instagram",
            url: `https://instagram.com/${username}`,
            verified: true,
            confidence: 0.78,
            signals: [
                "Regular posting history (> 6 months)",
                "Natural follower growth curve",
                "Stories archive present",
            ],
        },
        weibo: {
            platform: "微博",
            url: `https://weibo.com/${username}`,
            verified: false,
            confidence: 0.42,
            signals: [
                "Account less than 3 months old",
                "No original posts",
                "Follower/following ratio suspicious",
            ],
        },
        wechat: {
            platform: "微信",
            url: `wechat://${username}`,
            verified: true,
            confidence: 0.65,
            signals: ["Moments active", "Mutual contacts found"],
        },
    };

    return mockResults[platform] ?? mockResults.instagram;
}

// ─── Tool: suggestVenue ──────────────────────────────────────────────────────

export interface VenueSuggestion {
    name: string;
    type: string;
    city: string;
    ambiance: string;
    priceRange: string;
    goodFor: string[];
}

/**
 * MCP Tool: Suggests date venues based on both users' preferences.
 * In production: would call a maps/places API via MCP server.
 */
export function suggestVenues(city: string, interests: string[]): VenueSuggestion[] {
    const allVenues: VenueSuggestion[] = [
        {
            name: "Blue Bottle Coffee",
            type: "咖啡馆",
            city: "上海",
            ambiance: "安静、工业风",
            priceRange: "¥¥",
            goodFor: ["咖啡", "读书", "安静聊天"],
        },
        {
            name: "M50 创意园",
            type: "艺术园区",
            city: "上海",
            ambiance: "艺术、开阔",
            priceRange: "¥",
            goodFor: ["摄影", "艺术", "漫步"],
        },
        {
            name: "三里屯太古里",
            type: "户外商区",
            city: "北京",
            ambiance: "活力、时尚",
            priceRange: "¥¥¥",
            goodFor: ["购物", "餐饮", "看电影"],
        },
        {
            name: "京都爵士吧",
            type: "音乐酒吧",
            city: "北京",
            ambiance: "温馨、有品味",
            priceRange: "¥¥",
            goodFor: ["爵士乐", "鸡尾酒", "夜晚约会"],
        },
    ];

    // Filter by city, then score by interest match
    return allVenues
        .filter((v) => v.city === city)
        .sort((a, b) => {
            const scoreA = interests.filter((i) => a.goodFor.some((g) => g.includes(i))).length;
            const scoreB = interests.filter((i) => b.goodFor.some((g) => g.includes(i))).length;
            return scoreB - scoreA;
        })
        .slice(0, 3);
}
