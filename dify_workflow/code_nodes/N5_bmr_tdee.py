def _to_float(v, default=0.0):
    try:
        return float(v)
    except Exception:
        return default


def main(**args):
    height_cm = _to_float(args.get("height_cm"), 0.0)
    weight_kg = _to_float(args.get("weight_kg"), 0.0)
    age = _to_float(args.get("age"), 0.0)
    gender_en = str(args.get("gender_en", "")).strip().lower()
    activity_factor = _to_float(args.get("activity_factor"), 1.2)

    if gender_en == "male":
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

    tdee = bmr * activity_factor

    return {
        "bmr": int(round(bmr)),
        "tdee": int(round(tdee)),
    }
