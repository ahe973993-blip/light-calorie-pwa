import Foundation

struct DifyConfig: Codable {
    var baseURL: String = "http://localhost/v1"
    var apiKey: String = ""
    var userId: String = "ios-user"
}

struct NutritionInputs {
    var heightCm: String = ""
    var weightKg: String = ""
    var age: String = ""
    var gender: String = "男"
    var activityLevel: String = "中等活动"
    var breakfastItems: String = ""
    var lunchItems: String = ""
    var dinnerItems: String = ""

    var activityOptions: [String] {
        ["久坐", "轻量活动", "中等活动", "高强度活动", "极高活动"]
    }

    var genderOptions: [String] {
        ["男", "女"]
    }
}

struct MealTimelineEntry: Identifiable, Codable, Equatable {
    let id: UUID
    let dateKey: String
    let createdAt: Date
    var totalKcal: Int?
    var report: String

    var breakfastItems: String
    var lunchItems: String
    var dinnerItems: String

    var breakfastImageBase64: String
    var lunchImageBase64: String
    var dinnerImageBase64: String

    init(
        id: UUID = UUID(),
        dateKey: String,
        createdAt: Date = Date(),
        totalKcal: Int?,
        report: String,
        breakfastItems: String,
        lunchItems: String,
        dinnerItems: String,
        breakfastImageBase64: String,
        lunchImageBase64: String,
        dinnerImageBase64: String
    ) {
        self.id = id
        self.dateKey = dateKey
        self.createdAt = createdAt
        self.totalKcal = totalKcal
        self.report = report
        self.breakfastItems = breakfastItems
        self.lunchItems = lunchItems
        self.dinnerItems = dinnerItems
        self.breakfastImageBase64 = breakfastImageBase64
        self.lunchImageBase64 = lunchImageBase64
        self.dinnerImageBase64 = dinnerImageBase64
    }
}
