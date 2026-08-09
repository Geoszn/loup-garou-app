import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        // Sans ceci, la WKWebView utilise par défaut une session audio de
        // catégorie "ambient" : elle coupe TOUT son (effets sonores du jeu,
        // et même l'audio du vocal Daily.co) dès que le bouton silencieux
        // physique de l'iPhone est activé, et fait sortir la voix par
        // l'écouteur interne (comme un appel téléphonique) plutôt que le
        // haut-parleur. `.playAndRecord` + `.defaultToSpeaker` règle les deux
        // problèmes : le son sort toujours par le haut-parleur et ignore le
        // bouton silencieux, comme n'importe quelle vraie appli d'appel/jeu.
        //
        // Mode `.voiceChat` + `setActive(true)` : configuration standard pour
        // une capture micro WebRTC (Daily.co) dans une WKWebView — voir
        // notamment les forums développeurs Apple sur AVAudioSession +
        // WKWebView/WebRTC. Un essai précédent avait retiré `setActive(true)`
        // en pensant qu'il cassait le vocal, mais le vrai bug à l'époque
        // était ailleurs (URL relative /api/... côté client, corrigée
        // depuis) : la connexion elle-même échouait avant même d'atteindre
        // le stade de la capture audio, donc ce test n'a jamais été
        // concluant. Une fois la connexion Daily réellement établie (voyants
        // de connexion visibles), plus aucun son ne circulait dans les deux
        // sens et le voyant de niveau sonore ne s'allumait jamais — signe
        // que la session audio n'était en réalité jamais activée. `.voiceChat`
        // active en plus l'annulation d'écho / la réduction de bruit gérées
        // par iOS, adaptées à un usage façon appel plutôt qu'à de la simple
        // lecture.
        try? AVAudioSession.sharedInstance().setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
        )
        try? AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)

        // Demande l'autorisation du micro dès le lancement (vocal en partie,
        // voir Daily.co) plutôt que d'attendre que la personne rejoigne un
        // salon vocal — même logique que côté Android.
        AVAudioSession.sharedInstance().requestRecordPermission { _ in }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
