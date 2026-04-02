import SwiftUI

struct ContentView: View {
    @ObservedObject var viewModel: NutritionViewModel

    var body: some View {
        TabView {
            RecordFormView(viewModel: viewModel)
                .tabItem {
                    Label("记录", systemImage: "square.and.pencil")
                }

            TimelineListView(viewModel: viewModel)
                .tabItem {
                    Label("时间线", systemImage: "chart.bar.xaxis")
                }
        }
        .tint(Color(red: 1.0, green: 0.14, blue: 0.26))
    }
}
