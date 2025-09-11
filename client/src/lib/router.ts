// Router facade to ensure single wouter instance across the app
// This prevents context split issues where different components use different instances

export { 
  Switch, 
  Route, 
  Redirect, 
  Link, 
  useLocation, 
  useRoute, 
  Router 
} from 'wouter';