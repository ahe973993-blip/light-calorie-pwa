import SwiftUI
import PhotosUI

struct RecordFormView: View {
    @ObservedObject var viewModel: NutritionViewModel

    @State private var breakfastPickerItem: PhotosPickerItem?
    @State private var lunchPickerItem: PhotosPickerItem?
    @State private var dinnerPickerItem: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    hero
                    basicInfoCard
                    mealsPhotoCard
                    mealsTextCard
                    apiConfigCard
                    actionCard
                    resultCard
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 20)
            }
            .background(Color(red: 0.98, green: 0.98, blue: 0.99).ignoresSafeArea())
            .navigationTitle("轻卡小记")
        }
        .onChange(of: breakfastPickerItem) { newValue in
            loadImage(item: newValue) { image in
                viewModel.breakfastImage = image
            }
        }
        .onChange(of: lunchPickerItem) { newValue in
            loadImage(item: newValue) { image in
                viewModel.lunchImage = image
            }
        }
        .onChange(of: dinnerPickerItem) { newValue in
            loadImage(item: newValue) { image in
                viewModel.dinnerImage = image
            }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("小红书风格 · AI 营养助手")
                .font(.caption.weight(.bold))
                .foregroundStyle(Color(red: 0.9, green: 0.12, blue: 0.28))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color(red: 1, green: 0.93, blue: 0.95))
                .clipShape(Capsule())

            Text("今天吃得怎么样？")
                .font(.system(size: 30, weight: .black))

            Text("上传三餐图片并生成每日热量报告，自动加入时间线。")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var basicInfoCard: some View {
        card(title: "基础信息") {
            Group {
                rowTextField(title: "身高(cm)", text: $viewModel.inputs.heightCm, keyboard: .numberPad)
                rowTextField(title: "体重(kg)", text: $viewModel.inputs.weightKg, keyboard: .decimalPad)
                rowTextField(title: "年龄", text: $viewModel.inputs.age, keyboard: .numberPad)
            }

            Picker("性别", selection: $viewModel.inputs.gender) {
                ForEach(viewModel.inputs.genderOptions, id: \.self) { option in
                    Text(option).tag(option)
                }
            }

            Picker("活动水平", selection: $viewModel.inputs.activityLevel) {
                ForEach(viewModel.inputs.activityOptions, id: \.self) { option in
                    Text(option).tag(option)
                }
            }
        }
    }

    private var mealsPhotoCard: some View {
        card(title: "三餐图片") {
            VStack(spacing: 10) {
                photoRow(title: "早餐", image: viewModel.breakfastImage, pickerItem: $breakfastPickerItem)
                photoRow(title: "午餐", image: viewModel.lunchImage, pickerItem: $lunchPickerItem)
                photoRow(title: "晚餐", image: viewModel.dinnerImage, pickerItem: $dinnerPickerItem)
            }
        }
    }

    private var mealsTextCard: some View {
        card(title: "食物克重") {
            textEditorBlock(title: "早餐食物及克重", text: $viewModel.inputs.breakfastItems)
            textEditorBlock(title: "午餐食物及克重", text: $viewModel.inputs.lunchItems)
            textEditorBlock(title: "晚餐食物及克重", text: $viewModel.inputs.dinnerItems)
        }
    }

    private var apiConfigCard: some View {
        card(title: "接口配置") {
            rowTextField(title: "Base URL", text: $viewModel.config.baseURL, keyboard: .URL)
            rowTextField(title: "API Key", text: $viewModel.config.apiKey, keyboard: .default)
            rowTextField(title: "user", text: $viewModel.config.userId, keyboard: .default)

            Text("提示：真机调试时，若 Dify 在电脑上运行，请将 Base URL 改为电脑局域网 IP。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var actionCard: some View {
        card(title: "执行") {
            Button(action: {
                Task { await viewModel.submit() }
            }) {
                HStack {
                    if viewModel.isLoading {
                        ProgressView()
                            .tint(.white)
                    }
                    Text(viewModel.isLoading ? "生成中..." : "生成今日热量报告")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color(red: 1.0, green: 0.14, blue: 0.26))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .disabled(viewModel.isLoading)

            Text(viewModel.statusText)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var resultCard: some View {
        card(title: "报告结果") {
            Text(viewModel.reportText)
                .font(.footnote.monospaced())
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(Color.black.opacity(0.88))
                .foregroundStyle(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func card<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)

            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color(red: 0.9, green: 0.92, blue: 0.96), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.05), radius: 12, y: 6)
    }

    private func rowTextField(title: String, text: Binding<String>, keyboard: UIKeyboardType) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))

            TextField("请输入\(title)", text: text)
                .textFieldStyle(.roundedBorder)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
    }

    private func textEditorBlock(title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.semibold))

            TextEditor(text: text)
                .frame(minHeight: 72)
                .padding(8)
                .background(Color(red: 0.97, green: 0.97, blue: 0.99))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color(red: 0.86, green: 0.88, blue: 0.93), lineWidth: 1)
                )
        }
    }

    private func photoRow(title: String, image: UIImage?, pickerItem: Binding<PhotosPickerItem?>) -> some View {
        HStack(spacing: 12) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 84, height: 84)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color(red: 0.95, green: 0.96, blue: 0.99))
                    .frame(width: 84, height: 84)
                    .overlay(Text("暂无").font(.caption).foregroundStyle(.secondary))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("\(title)图片")
                    .font(.subheadline.weight(.semibold))

                PhotosPicker(selection: pickerItem, matching: .images, photoLibrary: .shared()) {
                    Text("从相册选择")
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color(red: 1, green: 0.93, blue: 0.95))
                        .foregroundStyle(Color(red: 0.9, green: 0.12, blue: 0.28))
                        .clipShape(Capsule())
                }
            }

            Spacer(minLength: 0)
        }
    }

    private func loadImage(item: PhotosPickerItem?, completion: @escaping (UIImage?) -> Void) {
        guard let item else {
            completion(nil)
            return
        }

        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                completion(image)
            } else {
                completion(nil)
            }
        }
    }
}
