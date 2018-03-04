// Get app configuration
const config            = require('../app.config');
const nodeRest          = require('node-rest-client').Client;
const nodeRestClient    = new nodeRest();
const commonServices    = require('./common');
const log               = require('node-file-logger');

const turboAPIBaseURL = config.paymentAPI.BaseURL;

module.exports = {

    // Process requests - interact with Payment API
    ProcessRequest: function(res, result) {

        let SPEECH = {
            default: 'I am not able to find the information currently. Please try again.',
            policyNotFound: 'I was not able to find any data for this policy number. Please try again.',
            otpMailed: 'Please enter the one time password emailed to you at: ',
            correctOtp: 'Your OTP has been verified.',
            wrongOtp: 'The password you entered is incorrect. Please enter again.',
            OTPError: 'I am not able to fetch any information currently because of a system error. Please try again.'
        };

        if(result) {
            // Authentication action
            let params = result.parameters;

            if(result.action == 'authenticate' || result.action == 'reauthenticate') {
                

                // Check policy number
                if(params['policynumber']) {

                    let url = turboAPIBaseURL + 'Chatbot/GetCustomerDetails?PolicyNumber=' 
                        + params['policynumber'];
        
                    nodeRestClient.get(url, function (data, response) {
        
                        log.Debug(data, 'PaymentAPI', 'Check policy number');
        
                        let validPolicy = false;
                        if(data) {
                            if(data.Error == 0) {
                                if(data.Email) {
                                    validPolicy = true;
                                }
                            }
                        }
        
                        if(validPolicy) {
                            // Send OTP  
                            let otpUrl = turboAPIBaseURL + 'Chatbot/SendOTP';
        
                            let args = {
                                data: {
                                    Name: data.Name,
                                    Email: data.Email,
                                    PolicyNumber: data.PolicyNumber
                                },
                                headers: { "Content-Type": "application/json" }
                            };
        
                            nodeRestClient.post(otpUrl, args, function (data, response) {
                                if(data) {
                                    log.Debug(data, 'PaymentAPI', 'Send OTP');
        
                                    if(data.Error == 0) {
                                        
                                        // Send a validated authentication context
                                        let contextOut = [
                                            {
                                                name: "otp", 
                                                lifespan: 500, 
                                                parameters : 
                                                { 
                                                    serverotp: data.EncryptedOTP,
                                                    policynumber: args.data.PolicyNumber 
                                                }
                                            }
                                        ];
        
                                        let speech = SPEECH.otpMailed + args.data.Email;
                                        commonServices.SendResponse(res, speech, contextOut);
                                    
                                    } else {
                                        // OTP could not be sent. Try again   
                                        log.Error('OTP Error', 'PaymentAPI', 'Send OTP', data);  
                                        commonServices.SendResponse(res, SPEECH.OTPError);
                                    }
                                } else {
                                    // OTP could not be sent. Try again   
                                    log.Error('OTP Error', 'PaymentAPI', 'Send OTP', data);  
                                    commonServices.SendResponse(res, SPEECH.OTPError);
                                }
                            });
                        } else {
                            // Incorrect policy number, please try again
                            let followupEvent = {
                                name: 'reauthenticate'
                            };
        
                            commonServices.SendResponse(res, '', null, followupEvent);
                        }
                    });
        
                } 
                
            } 

            else if(result.action == 'authenticate.verifyotp' || result.action == 'reauthenticate.verifyotp') {
                if(params['userotp']) {
                    // Find OTP context
                    let otpContext = commonServices.FindContext(result, 'otp');
        
                    // If OTP matches with the one entered by user
                    if(otpContext) {
                        if(otpContext.parameters.serverotp.toLowerCase() === params['userotp'].toLowerCase()) {
    
                            let contextOut = [
                                {
                                    name: "sessioninfo", 
                                    lifespan: 500, 
                                    parameters : 
                                    { 
                                        sessionPolicyNumber: otpContext.parameters.policynumber
                                    }
                                },
                            ]
    
                            // Check last event details
                            let lastEventContext = commonServices.FindContext(result, 'lastevent');
                            if(lastEventContext) {
                                // Send user to the last event
                                let followupEvent = {
                                    name: lastEventContext.parameters.eventname
                                };

                                commonServices.SendResponse(res, '', contextOut, followupEvent);
                            }
                        } else {
                            commonServices.SendResponse(res, SPEECH.wrongOtp);
                        }
                    } else {
                        // Send user back to authentication intent
                        commonServices.SendResponse(res, '', null, { name: 'reauthenticate'});
                    }
                }
            }
            

            // Policydetails action
            else if(result.action == 'getpolicydetails') {

                let sessionPolicyNumber = commonServices.FindSessionPolicyNumber(result);
                let userPolicyNumber = result.parameters && result.parameters.pnumgetpolicydetails;

                // User is already logged in
                if(sessionPolicyNumber) {

                    // If user wants details on another policy number
                    // send them back to authentication screen
                    if(userPolicyNumber) {
                        if(sessionPolicyNumber != userPolicyNumber) {
                            // Send user back to authentication intent
                            commonServices.SendToAuthentication(res, userPolicyNumber, 'getpolicydetails');
                            return;
                        }
                    }
                    
                    // Fetch policy details for user
                    let url = turboAPIBaseURL + 'Chatbot/GetPolicyDetails?PolicyNumber=' + sessionPolicyNumber;
                    nodeRestClient.get(url, function (data, response) {
                        if(data) {
                            log.Debug(data);
                            if(data.Error == 0) {
                                let customerName = false;            
                                if(data.CustomerContactDetails) {
                                    customerName = data.CustomerContactDetails.FirstName + ' ' 
                                        + data.CustomerContactDetails.LastName;
                                } 
                
                                let speech;
                
                                if(data.CustomerID) {
                                    speech = data.ProductType + ' Policy ' + data.PolicyNumber + ' with Insured name ' 
                                        + customerName + ' is valid till ' + data.PolicyEndDate + ' with total premium $' 
                                        + data.TotalPremium ;
                                } else {
                                    speech = policyNotFound;
                                }                       
        
                                commonServices.SendResponse(res, speech);
        
                            } else {
                                // Send user back to authentication intent
                                commonServices.SendResponse(res, '', null, { name: 'reauthenticate'});
                            }
                        } else {
                            // Send user back to authentication intent
                            commonServices.SendResponse(res, '', null, { name: 'reauthenticate'});               
                        }
                    });            
                }
                // User is not yet logged in 
                else  {
                    // Send user back to authentication intent
                    commonServices.SendToAuthentication(res, userPolicyNumber, 'getpolicydetails');
                }

            } else if(result.action == 'getlastinstalment') {
                commonServices.SendResponse(res, SPEECH.default);
            } else if(result.action == 'getpolicystartdate') {
                commonServices.SendResponse(res, SPEECH.default);
            } else {
                commonServices.SendResponse(res, SPEECH.default);
            }
        } else {
            commonServices.SendResponse(res, SPEECH.default);
        }
    }

}