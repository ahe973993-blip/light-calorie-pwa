import Foundation
import UIKit

@MainActor
final class NutritionViewModel: ObservableObject {
    @Published var config = DifyConfig()
    @Published var inputs = NutritionInputs()

    @Published var breakfastImage: UIImage?
    @Published var lunchImage: UIImage?
    @Published var dinnerImage: UIImage?

    @Published var isLoading = false
    @Published var statusText = "准备就绪"
    @Published var reportText = "还没有结果，先填写并生成报告。"
    @Published var rawResponse = "{}"

    @Published private(set) var timelineEntries: [MealTimelineEntry] = []

    private let apiClient = DifyAPIClient()
    private let timelineStore = TimelineStore()

    func onAppear() {
        timelineEntries = timelineStore.load()
    }

    func submit() async {
        guard !config.apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            statusText = "请先填写 API Key"
            return
        }
        guard let breakfastImage, let lunchImage, let dinnerImage else {
            statusText = "请完整选择早餐/午餐/晚餐三张图片"
            return
        }
        guard isBasicInputValid else {
            statusText = "请完整填写身高、体重、年龄与三餐克重"
            return
        }

        isLoading = true
        statusText = "正在上传图片并生成报告..."

        do {
            let result = try await apiClient.runNutritionWorkflow(
                config: config,
                inputs: inputs,
                breakfastImage: breakfastImage,
                lunchImage: lunchImage,
                dinnerImage: dinnerImage
            )

            reportText = result.report
            rawResponse = result.rawJSON
            statusText = "生成成功"

            appendTimeline(report: result.report, totalKcal: result.totalKcal)
        } catch {
            statusText = error.localizedDescription
            reportText = "请求失败：\(error.localizedDescription)"
        }

        isLoading = false
    }

    private var isBasicInputValid: Bool {
        !inputs.heightCm.isEmpty
            && !inputs.weightKg.isEmpty
            && !inputs.age.isEmpty
            && !inputs.breakfastItems.isEmpty
            && !inputs.lunchItems.isEmpty
            && !inputs.dinnerItems.isEmpty
    }

    private func appendTimeline(report: String, totalKcal: Int?) {
        let now = Date()
        let dateKey = Self.dayKeyFormatter.string(from: now)

        let entry = MealTimelineEntry(
            dateKey: dateKey,
            createdAt: now,
            totalKcal: totalKcal,
            report: report,
            breakfastItems: inputs.breakfastItems,
            lunchItems: inputs.lunchItems,
            dinnerItems: inputs.dinnerItems,
            breakfastImageBase64: breakfastImage?.jpegData(compressionQuality: 0.8)?.base64EncodedString() ?? "",
            lunchImageBase64: lunchImage?.jpegData(compressionQuality: 0.8)?.base64EncodedString() ?? "",
            dinnerImageBase64: dinnerImage?.jpegData(compressionQuality: 0.8)?.base64EncodedString() ?? ""
        )

        if let idx = timelineEntries.firstIndex(where: { $0.dateKey == dateKey }) {
            timelineEntries[idx] = entry
        } else {
            timelineEntries.insert(entry, at: 0)
        }

        timelineEntries.sort { $0.createdAt > $1.createdAt }
        timelineEntries = Array(timelineEntries.prefix(60))
        timelineStore.save(timelineEntries)
    }

    static let dayKeyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "zh_CN")
        return f
    }()
}
