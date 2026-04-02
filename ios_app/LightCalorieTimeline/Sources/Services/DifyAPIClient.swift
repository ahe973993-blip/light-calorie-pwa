import Foundation
import UIKit

enum DifyAPIError: LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case uploadFailed(String)
    case workflowFailed(String)
    case parseFailed
    case imageEncodeFailed

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Base URL 无效"
        case .invalidResponse:
            return "服务端响应格式异常"
        case .uploadFailed(let msg):
            return "图片上传失败：\(msg)"
        case .workflowFailed(let msg):
            return "工作流运行失败：\(msg)"
        case .parseFailed:
            return "结果解析失败"
        case .imageEncodeFailed:
            return "图片编码失败"
        }
    }
}

final class DifyAPIClient {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func runNutritionWorkflow(
        config: DifyConfig,
        inputs: NutritionInputs,
        breakfastImage: UIImage,
        lunchImage: UIImage,
        dinnerImage: UIImage
    ) async throws -> (report: String, totalKcal: Int?, rawJSON: String) {
        let baseURL = config.baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let base = URL(string: baseURL) else {
            throw DifyAPIError.invalidBaseURL
        }

        let breakfastUploadID = try await uploadImage(base: base, config: config, image: breakfastImage, filename: "breakfast.jpg")
        let lunchUploadID = try await uploadImage(base: base, config: config, image: lunchImage, filename: "lunch.jpg")
        let dinnerUploadID = try await uploadImage(base: base, config: config, image: dinnerImage, filename: "dinner.jpg")

        let payload: [String: Any] = [
            "inputs": [
                "height_cm": Int(inputs.heightCm) ?? 0,
                "weight_kg": Int(inputs.weightKg) ?? 0,
                "age": Int(inputs.age) ?? 0,
                "gender": inputs.gender,
                "activity_level": inputs.activityLevel,
                "breakfast_items": inputs.breakfastItems,
                "lunch_items": inputs.lunchItems,
                "dinner_items": inputs.dinnerItems,
                "breakfast_image": [[
                    "type": "image",
                    "transfer_method": "local_file",
                    "upload_file_id": breakfastUploadID,
                ]],
                "lunch_image": [[
                    "type": "image",
                    "transfer_method": "local_file",
                    "upload_file_id": lunchUploadID,
                ]],
                "dinner_image": [[
                    "type": "image",
                    "transfer_method": "local_file",
                    "upload_file_id": dinnerUploadID,
                ]],
            ],
            "response_mode": "blocking",
            "user": config.userId,
        ]

        var request = URLRequest(url: base.appendingPathComponent("workflows/run"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw DifyAPIError.invalidResponse
        }

        let rawJSON = String(data: data, encoding: .utf8) ?? "{}"
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw DifyAPIError.parseFailed
        }

        if !(200 ... 299).contains(http.statusCode) {
            let msg = Self.extractErrorMessage(from: object)
            throw DifyAPIError.workflowFailed(msg)
        }

        let report = Self.extractReport(from: object)
        let kcal = Self.extractKcal(from: report)

        return (report: report, totalKcal: kcal, rawJSON: rawJSON)
    }

    private func uploadImage(base: URL, config: DifyConfig, image: UIImage, filename: String) async throws -> String {
        guard let imageData = image.jpegData(compressionQuality: 0.88) else {
            throw DifyAPIError.imageEncodeFailed
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: base.appendingPathComponent("files/upload"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let body = Self.buildMultipartBody(boundary: boundary, userId: config.userId, filename: filename, imageData: imageData)
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw DifyAPIError.invalidResponse
        }

        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw DifyAPIError.parseFailed
        }

        if !(200 ... 299).contains(http.statusCode) {
            let msg = Self.extractErrorMessage(from: object)
            throw DifyAPIError.uploadFailed(msg)
        }

        if let id = object["id"] as? String {
            return id
        }

        if let nested = object["data"] as? [String: Any], let id = nested["id"] as? String {
            return id
        }

        throw DifyAPIError.invalidResponse
    }

    private static func buildMultipartBody(boundary: String, userId: String, filename: String, imageData: Data) -> Data {
        var body = Data()
        let lineBreak = "\r\n"

        body.append("--\(boundary)\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"user\"\(lineBreak)\(lineBreak)".data(using: .utf8)!)
        body.append("\(userId)\(lineBreak)".data(using: .utf8)!)

        body.append("--\(boundary)\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\(lineBreak)\(lineBreak)".data(using: .utf8)!)
        body.append(imageData)
        body.append(lineBreak.data(using: .utf8)!)

        body.append("--\(boundary)--\(lineBreak)".data(using: .utf8)!)
        return body
    }

    private static func extractErrorMessage(from json: [String: Any]) -> String {
        if let m = json["message"] as? String { return m }
        if let m = json["error"] as? String { return m }
        if let m = json["detail"] as? String { return m }
        return "未知错误"
    }

    private static func extractReport(from json: [String: Any]) -> String {
        if let data = json["data"] as? [String: Any],
           let outputs = data["outputs"] as? [String: Any] {
            if let report = outputs["report"] as? String, !report.isEmpty {
                return report
            }
            if let outputString = outputs["outputString"] as? String, !outputString.isEmpty {
                return outputString
            }
            if let textValue = outputs.values.first(where: { value in
                if let text = value as? String { return !text.isEmpty }
                return false
            }) as? String {
                return textValue
            }
        }

        if let outputs = json["outputs"] as? [String: Any],
           let report = outputs["report"] as? String,
           !report.isEmpty {
            return report
        }

        return "工作流已执行，但未返回可展示文本。"
    }

    private static func extractKcal(from report: String) -> Int? {
        let pattern = "今日总摄入：\\s*(\\d+)\\s*kcal"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return nil
        }
        let nsText = report as NSString
        let range = NSRange(location: 0, length: nsText.length)
        guard let match = regex.firstMatch(in: report, options: [], range: range), match.numberOfRanges >= 2 else {
            return nil
        }
        let kcalText = nsText.substring(with: match.range(at: 1))
        return Int(kcalText)
    }
}
