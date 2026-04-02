import json
import re


def parse_vision_foods(raw_text):
    if raw_text is None:
        return []

    if isinstance(raw_text, dict):
        foods = raw_text.get("foods", [])
        return [str(x).strip() for x in foods if str(x).strip()]

    text = str(raw_text).strip()
    if not text:
        return []

    try:
        data = json.loads(text)
        foods = data.get("foods", []) if isinstance(data, dict) else []
        return [str(x).strip() for x in foods if str(x).strip()]
    except Exception:
        pass

    block = re.search(r"\{[\s\S]*\}", text)
    if block:
        try:
            data = json.loads(block.group(0))
            foods = data.get("foods", []) if isinstance(data, dict) else []
            return [str(x).strip() for x in foods if str(x).strip()]
        except Exception:
            pass

    fallback = re.split(r"[,，、;；\n]+", text)
    return [x.strip() for x in fallback if x.strip()]


def merge_meal(user_items, vision_foods):
    user_items = user_items or []
    vision_foods = vision_foods or []

    if user_items:
        merged = {}
        for item in user_items:
            name = str(item.get("name", "")).strip()
            grams = float(item.get("grams", 0) or 0)
            if not name or grams <= 0:
                continue
            if name not in merged:
                merged[name] = {"name": name, "grams": 0.0, "estimated": False}
            merged[name]["grams"] += grams
        return [{"name": v["name"], "grams": round(v["grams"], 1), "estimated": False} for v in merged.values()]

    if vision_foods:
        dedup = []
        seen = set()
        for food in vision_foods:
            name = str(food).strip()
            if not name or name in seen:
                continue
            seen.add(name)
            dedup.append({"name": name, "grams": 100.0, "estimated": True})
        return dedup

    return []


def main(**args):
    breakfast_user = args.get("breakfast_user_items") or []
    lunch_user = args.get("lunch_user_items") or []
    dinner_user = args.get("dinner_user_items") or []

    breakfast_vision = parse_vision_foods(args.get("breakfast_vision_text", ""))
    lunch_vision = parse_vision_foods(args.get("lunch_vision_text", ""))
    dinner_vision = parse_vision_foods(args.get("dinner_vision_text", ""))

    breakfast_final = merge_meal(breakfast_user, breakfast_vision)
    lunch_final = merge_meal(lunch_user, lunch_vision)
    dinner_final = merge_meal(dinner_user, dinner_vision)

    return {
        "breakfast_final_items": breakfast_final,
        "lunch_final_items": lunch_final,
        "dinner_final_items": dinner_final,
    }
