Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest

  resources :properties do
    member do
      patch :notary_approve
      patch :buyer_approve
      patch :government_seal
      patch :mark_completed
      patch :cancel
      get :transactions # JSON polling endpoint
      get :document     # Render / descargar documento original si existe
    end
  end
  namespace :blockchain do
    post :tx_callback, to: 'transactions#create'
  end
  resource :wallet, only: [] do
    get :connect
  end

  root "properties#index"
end
