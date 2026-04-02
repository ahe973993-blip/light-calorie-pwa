import SwiftUI

@main
struct LightCalorieTimelineApp: App {
    @StateObject private var viewModel = NutritionViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: viewModel)
                .onAppear {
                    viewModel.onAppear()
                }
        }
    }
}
