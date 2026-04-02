import SwiftUI
import UIKit

struct TimelineListView: View {
    @ObservedObject var viewModel: NutritionViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if viewModel.timelineEntries.isEmpty {
                        emptyState
                    } else {
                        ForEach(viewModel.timelineEntries) { entry in
                            timelineRow(entry: entry)
                        }
                    }
                }
                .padding(14)
            }
            .background(Color(red: 0.97, green: 0.97, blue: 0.99).ignoresSafeArea())
            .navigationTitle("饮食时间线")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Text("\(viewModel.timelineEntries.count) 天")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "photo.on.rectangle")
                .font(.system(size: 30))
                .foregroundStyle(.secondary)
            Text("还没有时间线记录")
                .font(.headline)
            Text("先在“记录”页生成一次报告，就会看到每天早中晚照片和总热量。")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func timelineRow(entry: MealTimelineEntry) -> some View {
        HStack(spacing: 10) {
            datePanel(date: entry.createdAt)

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(entry.createdAt.formatted(date: .abbreviated, time: .omitted))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Spacer(minLength: 8)

                    Text("总热量 \(entry.totalKcal.map { "\($0) kcal" } ?? "待补充")")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color(red: 1, green: 0.93, blue: 0.95))
                        .foregroundStyle(Color(red: 0.85, green: 0.14, blue: 0.30))
                        .clipShape(Capsule())
                }

                HStack(spacing: 8) {
                    mealTile(base64: entry.breakfastImageBase64, label: "早餐", color: .orange)
                    mealTile(base64: entry.lunchImageBase64, label: "午餐", color: .red)
                    mealTile(base64: entry.dinnerImageBase64, label: "晚餐", color: .cyan)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func datePanel(date: Date) -> some View {
        VStack(spacing: 2) {
            Text(weekdayText(from: date))
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text(dayNumber(from: date))
                .font(.system(size: 34, weight: .black))
            Text(monthText(from: date))
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
        }
        .frame(width: 70, height: 118)
        .background(
            LinearGradient(
                colors: [Color(red: 0.97, green: 0.97, blue: 0.99), Color(red: 0.94, green: 0.95, blue: 0.98)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func mealTile(base64: String, label: String, color: Color) -> some View {
        ZStack(alignment: .topLeading) {
            if let data = Data(base64Encoded: base64), let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color(red: 0.94, green: 0.95, blue: 0.98))
                    .aspectRatio(1, contentMode: .fit)
                    .overlay(
                        Text("暂无")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    )
            }

            Text(label)
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(color)
                .foregroundStyle(.white)
                .clipShape(Capsule())
                .padding(6)
        }
    }

    private func weekdayText(from date: Date) -> String {
        let idx = Calendar.current.component(.weekday, from: date)
        let names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
        return names[max(0, min(idx - 1, names.count - 1))]
    }

    private func dayNumber(from date: Date) -> String {
        String(Calendar.current.component(.day, from: date))
    }

    private func monthText(from date: Date) -> String {
        "\(Calendar.current.component(.month, from: date))月"
    }
}
